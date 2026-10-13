// The WCLAP-909 as a CLAP instance: voices, the pattern sequencer (driven by the host's transport) and the
// connection to the webview page.

import {AudioBuffer, Event, EventType, Host, Process, Transport} from "./clap"
import {ParamId, Params} from "./params"
import {Channel, Layout, NUM_PATTERNS, NUM_STEPS, Pattern, Step} from "./patterns"
import {Frame, NO_PATTERN} from "./protocol"
import {ChannelPlayer, dbToGain} from "./voices"

const OUT_QUEUE_SIZE: i32 = 256
const SEND_BUFFER_SIZE: i32 = 8192
const STATE_MAGIC: u32 = 0x39303954 // "T909"
const STATE_VERSION: u32 = 2 // 2: 64 steps
const STATE_HEADER: i32 = 12
const MAX_ACCENT: f64 = 18.0 // dB between normal and accented steps at full TOTAL ACCENT
const ACCENT_MIDDLE: f64 = -13.5

// General MIDI drum notes
function channelOfKey(key: i32): i32 {
    switch (key) {
        case 35: case 36: return Channel.Bassdrum
        case 38: case 40: return Channel.Snaredrum
        case 41: case 43: return Channel.TomLow
        case 45: case 47: return Channel.TomMid
        case 48: case 50: return Channel.TomHi
        case 37: return Channel.Rim
        case 39: return Channel.Clap
        case 42: case 44: case 46: return Channel.Hihat
        case 49: case 57: return Channel.Crash
        case 51: case 59: return Channel.Ride
        default: return -1
    }
}

export class Plugin {
    readonly params: Params = new Params()
    readonly patterns: StaticArray<Pattern> = new StaticArray<Pattern>(NUM_PATTERNS)
    readonly channels: StaticArray<ChannelPlayer> = new StaticArray<ChannelPlayer>(Channel.Count)

    // host and its extensions
    hostParams: usize = 0
    hostWebview: usize = 0
    guiOpen: bool = false

    private sampleRate: f64 = 44100.0
    private mix: usize = 0
    private mixCapacity: u32 = 0
    private frameIndex: i64 = 0
    private volume: f64 = 1.0

    // sequencer
    private playingPattern: i32 = 0
    private queuedPattern: i32 = -1
    private stepIndex: i32 = -1
    private position: f64 = 0.0
    private expectedBars: f64 = 0.0
    private bpm: f64 = 120.0
    private moving: bool = false

    // page updates
    private positionDirty: bool = false
    private dirtyParams: u32 = 0
    private callbackRequested: bool = false
    private framesSinceRequest: i32 = 0
    private readonly sendBuffer: usize = heap.alloc(SEND_BUFFER_SIZE)

    // events for the host (edits made in the page)
    private readonly outTypes: StaticArray<u16> = new StaticArray<u16>(OUT_QUEUE_SIZE)
    private readonly outIds: StaticArray<u32> = new StaticArray<u32>(OUT_QUEUE_SIZE)
    private readonly outValues: StaticArray<f64> = new StaticArray<f64>(OUT_QUEUE_SIZE)
    private outCount: i32 = 0
    private readonly eventBuffer: usize = heap.alloc(64)

    constructor(readonly host: usize) {
        for (let i = 0; i < NUM_PATTERNS; i++) unchecked(this.patterns[i] = new Pattern())
        for (let i = 0; i < Channel.Count; i++) unchecked(this.channels[i] = new ChannelPlayer(this.params, i))
    }

    // -------------------------------------------------------------------------------------------------------------
    // Lifecycle

    activate(sampleRate: f64, maxFrames: u32): bool {
        this.sampleRate = sampleRate
        if (maxFrames > this.mixCapacity) {
            this.mix = heap.alloc(<usize>maxFrames << 2)
            this.mixCapacity = maxFrames
        }
        for (let i = 0; i < Channel.Count; i++) {
            const channel = unchecked(this.channels[i])
            channel.setSampleRate(sampleRate)
            channel.reset()
        }
        this.volume = dbToGain(this.params.plain(ParamId.Volume))
        return true
    }

    reset(): void {
        for (let i = 0; i < Channel.Count; i++) unchecked(this.channels[i]).reset()
        this.moving = false
        this.setStep(-1)
    }

    // -------------------------------------------------------------------------------------------------------------
    // Process

    process(process: usize): void {
        const frames = load<u32>(process + Process.FRAMES_COUNT)
        this.readEvents(load<usize>(process + Process.IN_EVENTS))
        this.writeOutEvents(load<usize>(process + Process.OUT_EVENTS))
        if (frames > this.mixCapacity) return // the host broke its max_frames_count promise
        this.sequence(load<usize>(process + Process.TRANSPORT), frames)

        const mix = this.mix
        memory.fill(mix, 0, <usize>frames << 2)
        for (let i = 0; i < Channel.Count; i++) unchecked(this.channels[i]).process(mix, this.frameIndex, frames)

        // volume, smoothed over the block
        const target = dbToGain(this.params.plain(ParamId.Volume))
        const delta = (target - this.volume) / <f64>max<u32>(frames, 1)
        let gain = this.volume
        const outputs = load<usize>(process + Process.AUDIO_OUTPUTS)
        const outputCount = load<u32>(process + Process.AUDIO_OUTPUTS_COUNT)
        if (outputs != 0 && outputCount > 0) {
            const data = load<usize>(outputs + AudioBuffer.DATA32)
            const channelCount = load<u32>(outputs + AudioBuffer.CHANNEL_COUNT)
            const left = channelCount > 0 ? load<usize>(data) : 0
            const right = channelCount > 1 ? load<usize>(data + 4) : 0
            for (let i: u32 = 0; i < frames; i++) {
                gain += delta
                const value = <f32>(<f64>load<f32>(mix + (<usize>i << 2)) * gain)
                if (left != 0) store<f32>(left + (<usize>i << 2), value)
                if (right != 0) store<f32>(right + (<usize>i << 2), value)
            }
        }
        this.volume = target
        this.frameIndex += <i64>frames
        this.requestPageUpdate(<i32>frames)
    }

    flush(inEvents: usize, outEvents: usize): void {
        this.readEvents(inEvents)
        this.writeOutEvents(outEvents)
    }

    private readEvents(events: usize): void {
        if (events == 0) return
        const count = call_indirect<u32>(load<u32>(events + 4), events)
        for (let i: u32 = 0; i < count; i++) {
            const event = call_indirect<usize>(load<u32>(events + 8), events, i)
            if (event == 0 || load<u16>(event + Event.SPACE_ID) != 0) continue
            const type = load<u16>(event + Event.TYPE)
            const time = <i64>load<u32>(event + Event.TIME)
            if (type == EventType.PARAM_VALUE) {
                const id = load<u32>(event + Event.PARAM_ID)
                if (id < ParamId.Count) {
                    this.params.set(id, load<f64>(event + Event.PARAM_VALUE))
                    this.dirtyParams |= 1 << id
                }
            } else if (type == EventType.NOTE_ON) {
                this.playKey(<i32>load<i16>(event + Event.NOTE_KEY), load<f64>(event + Event.NOTE_VELOCITY), time)
            } else if (type == EventType.MIDI) {
                const status = load<u8>(event + Event.MIDI_DATA) & 0xf0
                const velocity = load<u8>(event + Event.MIDI_DATA + 2)
                if (status == 0x90 && velocity > 0) {
                    this.playKey(<i32>load<u8>(event + Event.MIDI_DATA + 1), <f64>velocity / 127.0, time)
                }
            }
        }
    }

    private playKey(key: i32, velocity: f64, time: i64): void {
        const channel = channelOfKey(key)
        if (channel < 0) return
        const accent = velocity >= 0.5
        const step = key == 46 ? (accent ? Step.ExtraAccent : Step.Extra) : (accent ? Step.Full : Step.Weak)
        unchecked(this.channels[channel]).schedule(this.frameIndex + time, step, this.resolveLevel(step))
    }

    // TOTAL ACCENT sets the distance between normal and accented steps (0...18 dB), spread evenly around a fixed
    // middle, so turning it changes the accents, not the overall loudness. At 50% normal steps play at -18 dB and
    // accented ones at -9 dB.
    private resolveLevel(step: u8): f64 {
        const half = this.params.plain(ParamId.Accent) * MAX_ACCENT * 0.5
        return Step.isAccent(step) ? ACCENT_MIDDLE + half : ACCENT_MIDDLE - half
    }

    // -------------------------------------------------------------------------------------------------------------
    // Sequencer. The host's transport drives it: song position (4/4 assumed) and tempo. TR-909 patterns start
    // from phase zero, so the pattern position is the song position modulo the pattern duration.

    private sequence(transport: usize, frames: u32): void {
        const flags = transport != 0 ? load<u32>(transport + Transport.FLAGS) : 0
        const required = Transport.IS_PLAYING | Transport.HAS_TEMPO | Transport.HAS_BEATS_TIMELINE
        if ((flags & required) != required) {
            if (this.moving) {
                this.moving = false
                if (this.queuedPattern >= 0) this.switchToQueued()
                this.setStep(-1)
            }
            return
        }
        this.bpm = load<f64>(transport + Transport.TEMPO)
        if (this.bpm <= 0.0) return
        const bars = <f64>load<i64>(transport + Transport.SONG_POS_BEATS) / Transport.BEATTIME_FACTOR / 4.0
        const increment = <f64>frames * this.bpm / (this.sampleRate * 240.0)
        if (!this.moving || Math.abs(bars - this.expectedBars) > 1e-6) {
            if (this.queuedPattern >= 0) this.switchToQueued()
            const duration = unchecked(this.patterns[this.playingPattern]).duration()
            this.position = bars - Math.floor(bars / duration) * duration
            this.moving = true
        }
        this.expectedBars = bars + increment
        this.advance(increment)
    }

    private advance(increment: f64): void {
        let pattern = unchecked(this.patterns[this.playingPattern])
        const p0 = this.position
        const p1 = p0 + increment
        const duration = pattern.duration()
        if (p1 >= duration) {
            this.sequenceSection(pattern, p0, duration, 0.0)
            if (this.queuedPattern >= 0) this.switchToQueued()
            pattern = unchecked(this.patterns[this.playingPattern])
            let target = p1 - duration
            const next = pattern.duration()
            if (target >= next) target -= Math.floor(target / next) * next
            this.sequenceSection(pattern, 0.0, target, duration - p0)
            this.position = target
        } else {
            this.sequenceSection(pattern, p0, p1, 0.0)
            this.position = p1
        }
    }

    // offset: bars from the block start to p0
    private sequenceSection(pattern: Pattern, p0: f64, p1: f64, offset: f64): void {
        const scale = pattern.scaleRatio()
        const searchStart = pattern.shuffleInverse(p0)
        const searchLimit = pattern.shuffleInverse(p1)
        let searchIndex = <i32>Math.floor(searchStart / scale)
        let searchPosition = <f64>searchIndex * scale
        while (searchPosition < searchLimit) {
            if (searchPosition >= searchStart && searchIndex >= 0 && searchIndex < NUM_STEPS) {
                this.playStep(pattern, searchIndex, offset + pattern.shuffleTransform(searchPosition) - p0)
            }
            searchPosition = <f64>(++searchIndex) * scale
        }
    }

    private playStep(pattern: Pattern, stepIndex: i32, offsetBars: f64): void {
        const frame = this.frameIndex + <i64>Math.floor(offsetBars * this.sampleRate * 240.0 / this.bpm)
        const flamFrame = frame + <i64>(pattern.flamDelay() / 1000.0 * this.sampleRate)
        for (let channel = 0; channel < Channel.Count; channel++) {
            const step = pattern.step(channel, stepIndex)
            if (step == Step.None) continue
            const level = this.resolveLevel(step)
            const player = unchecked(this.channels[channel])
            player.schedule(frame, step, level)
            if (channel != Channel.Hihat && Step.isExtra(step)) player.schedule(flamFrame, step, level)
        }
        this.setStep(stepIndex)
    }

    private switchToQueued(): void {
        this.playingPattern = this.queuedPattern
        this.queuedPattern = -1
        this.positionDirty = true
    }

    private setStep(stepIndex: i32): void {
        if (this.stepIndex == stepIndex) return
        this.stepIndex = stepIndex
        this.positionDirty = true
    }

    // While playing, the selection waits for the end of the running pattern, like on the hardware
    selectPattern(index: i32): void {
        if (index < 0 || index >= NUM_PATTERNS) return
        if (!this.moving || index == this.playingPattern) {
            this.playingPattern = index
            this.queuedPattern = -1
        } else {
            this.queuedPattern = index
        }
        this.positionDirty = true
    }

    // -------------------------------------------------------------------------------------------------------------
    // Page

    // Called from receive(), between process calls
    receive(ptr: usize, size: u32): bool {
        if (size < 4) return false
        const type = load<u8>(ptr)
        if (type == Frame.HELLO) {
            this.sendSnapshot()
        } else if (type == Frame.PARAM && size >= 16) {
            const id = load<u32>(ptr + 4)
            if (id >= ParamId.Count) return false
            this.params.set(id, load<f64>(ptr + 8))
            this.queueOut(EventType.PARAM_VALUE, id, this.params.unit(id))
        } else if (type == Frame.GESTURE && size >= 9) {
            const id = load<u32>(ptr + 4)
            if (id >= ParamId.Count) return false
            this.queueOut(load<u8>(ptr + 8) != 0 ? EventType.PARAM_GESTURE_BEGIN : EventType.PARAM_GESTURE_END, id, 0.0)
        } else if (type == Frame.PATTERN && size >= <u32>(8 + Layout.SIZE)) {
            const index = <i32>load<u8>(ptr + 4)
            if (index >= NUM_PATTERNS) return false
            unchecked(this.patterns[index]).read(ptr + 8)
            this.markDirty()
        } else if (type == Frame.SELECT && size >= 5) {
            this.selectPattern(<i32>load<u8>(ptr + 4))
            this.flushPage()
        } else {
            return false
        }
        return true
    }

    sendSnapshot(): void {
        if (!this.guiOpen || this.hostWebview == 0) return
        const buffer = this.sendBuffer
        store<u32>(buffer, Frame.SNAPSHOT)
        store<u32>(buffer + 4, ParamId.Count)
        let offset: usize = 8
        for (let id: u32 = 0; id < ParamId.Count; id++) {
            store<f64>(buffer + offset, this.params.unit(id))
            offset += 8
        }
        this.writePosition(buffer + offset)
        offset += 4
        for (let i = 0; i < NUM_PATTERNS; i++) {
            unchecked(this.patterns[i]).write(buffer + offset)
            offset += Layout.SIZE
        }
        this.send(buffer, <u32>offset)
        this.positionDirty = false
        this.dirtyParams = 0
    }

    onMainThread(): void {
        this.callbackRequested = false
        this.flushPage()
    }

    private flushPage(): void {
        if (!this.guiOpen || this.hostWebview == 0) {
            this.positionDirty = false
            this.dirtyParams = 0
            return
        }
        const buffer = this.sendBuffer
        if (this.positionDirty) {
            this.positionDirty = false
            store<u32>(buffer, Frame.POSITION)
            this.writePosition(buffer + 4)
            this.send(buffer, 8)
        }
        while (this.dirtyParams != 0) {
            const id = <u32>ctz(this.dirtyParams)
            this.dirtyParams &= ~(1 << id)
            store<u32>(buffer, Frame.PARAM)
            store<u32>(buffer + 4, id)
            store<f64>(buffer + 8, this.params.unit(id))
            this.send(buffer, 16)
        }
    }

    private writePosition(ptr: usize): void {
        store<u8>(ptr, <u8>this.playingPattern)
        store<u8>(ptr + 1, this.queuedPattern >= 0 ? <u8>this.queuedPattern : NO_PATTERN)
        store<i8>(ptr + 2, <i8>this.stepIndex)
        store<u8>(ptr + 3, 0)
    }

    private send(ptr: usize, size: u32): void {
        call_indirect<bool>(load<u32>(this.hostWebview), this.host, ptr, size)
    }

    // The page hears about changes from on_main_thread. A host that never calls back gets them from process,
    // at most about 30 times a second.
    private requestPageUpdate(frames: i32): void {
        if (!this.positionDirty && this.dirtyParams == 0) return
        if (!this.guiOpen) {
            this.positionDirty = false
            this.dirtyParams = 0
            return
        }
        if (!this.callbackRequested) {
            this.callbackRequested = true
            this.framesSinceRequest = 0
            call_indirect<void>(load<u32>(this.host + Host.REQUEST_CALLBACK), this.host)
            return
        }
        this.framesSinceRequest += frames
        if (<f64>this.framesSinceRequest > this.sampleRate / 30.0) {
            this.callbackRequested = false
            this.flushPage()
        }
    }

    private markDirty(): void {
        const state = call_indirect<usize>(load<u32>(this.host + Host.GET_EXTENSION), this.host, HOST_STATE)
        if (state != 0) call_indirect<void>(load<u32>(state), this.host)
    }

    // -------------------------------------------------------------------------------------------------------------
    // Events for the host

    private queueOut(type: u16, id: u32, value: f64): void {
        if (this.outCount < OUT_QUEUE_SIZE) {
            const index = this.outCount++
            unchecked(this.outTypes[index] = type)
            unchecked(this.outIds[index] = id)
            unchecked(this.outValues[index] = value)
        }
        if (this.hostParams != 0) call_indirect<void>(load<u32>(this.hostParams + 8), this.host)
    }

    private writeOutEvents(events: usize): void {
        if (events == 0 || this.outCount == 0) return
        const e = this.eventBuffer
        for (let i = 0; i < this.outCount; i++) {
            const type = unchecked(this.outTypes[i])
            memory.fill(e, 0, 48)
            store<u32>(e + Event.SIZE, type == EventType.PARAM_VALUE ? Event.PARAM_VALUE_SIZE : Event.PARAM_GESTURE_SIZE)
            store<u16>(e + Event.TYPE, type)
            store<u32>(e + Event.PARAM_ID, unchecked(this.outIds[i]))
            if (type == EventType.PARAM_VALUE) {
                store<i32>(e + 24, -1)  // note_id
                store<i16>(e + 28, -1)  // port_index
                store<i16>(e + 30, -1)  // channel
                store<i16>(e + 32, -1)  // key
                store<f64>(e + Event.PARAM_VALUE, unchecked(this.outValues[i]))
            }
            call_indirect<bool>(load<u32>(events + 4), events, e)
        }
        this.outCount = 0
    }

    // -------------------------------------------------------------------------------------------------------------
    // State: magic, version, parameter count, unit values, selected pattern, patterns

    stateSize(): i32 {return STATE_HEADER + ParamId.Count * 8 + 4 + NUM_PATTERNS * Layout.SIZE}

    writeState(ptr: usize): void {
        store<u32>(ptr, STATE_MAGIC)
        store<u32>(ptr + 4, STATE_VERSION)
        store<u32>(ptr + 8, ParamId.Count)
        let offset: usize = STATE_HEADER
        for (let id: u32 = 0; id < ParamId.Count; id++) {
            store<f64>(ptr + offset, this.params.unit(id))
            offset += 8
        }
        store<u32>(ptr + offset, <u32>(this.queuedPattern >= 0 ? this.queuedPattern : this.playingPattern))
        offset += 4
        for (let i = 0; i < NUM_PATTERNS; i++) {
            unchecked(this.patterns[i]).write(ptr + offset)
            offset += Layout.SIZE
        }
    }

    readState(ptr: usize, size: i32): bool {
        if (size < STATE_HEADER || load<u32>(ptr) != STATE_MAGIC || load<u32>(ptr + 4) != STATE_VERSION) return false
        const count = load<u32>(ptr + 8)
        if (size < STATE_HEADER + <i32>count * 8 + 4 + NUM_PATTERNS * Layout.SIZE) return false
        let offset: usize = STATE_HEADER
        for (let id: u32 = 0; id < count; id++) {
            if (id < ParamId.Count) this.params.set(id, load<f64>(ptr + offset))
            offset += 8
        }
        const selected = <i32>load<u32>(ptr + offset)
        offset += 4
        for (let i = 0; i < NUM_PATTERNS; i++) {
            unchecked(this.patterns[i]).read(ptr + offset)
            offset += Layout.SIZE
        }
        this.playingPattern = selected < NUM_PATTERNS ? selected : 0
        this.queuedPattern = -1
        this.sendSnapshot()
        return true
    }
}

const HOST_STATE: usize = changetype<usize>(String.UTF8.encode("clap.state", true))

export function hostExtension(host: usize, id: string): usize {
    const name = changetype<usize>(String.UTF8.encode(id, true))
    return call_indirect<usize>(load<u32>(host + Host.GET_EXTENSION), host, name)
}
