// The voices, ported from the former AudioWorklet (bassdrum, snaredrum and a sample voice with tune and decay).
// All voices are allocated up front: a channel owns a small pool and reuses voices that finished.

import {Params, ParamId} from "./params"
import {Channel, Step} from "./patterns"
import * as S from "./samples"

const RESOURCE_SAMPLE_RATE: f64 = 44100.0
const LOG_DB: f64 = Math.log(10.0) / 20.0

@inline export function dbToGain(db: f64): f64 { return Math.exp(db * LOG_DB) }

const SILENT_GAIN: f64 = dbToGain(-72.0)
const NO_PARAM: i32 = -1

class Interpolator {
    private length: i32 = 1
    private value: f64 = NaN
    private target: f64 = NaN
    private delta: f64 = 0.0
    private remaining: i32 = 0

    init(sampleRate: f64): void {this.length = max<i32>(1, <i32>(0.007 * sampleRate))}

    set(target: f64, smooth: bool): void {
        if (target == this.value) return
        if (!smooth || isNaN(this.value)) {
            this.value = this.target = target
            this.delta = 0.0
            this.remaining = 0
        } else {
            this.target = target
            this.delta = (target - this.value) / <f64>this.length
            this.remaining = this.length
        }
    }

    @inline moveAndGet(): f64 {
        if (0 < this.remaining) {
            this.value += this.delta
            if (0 == --this.remaining) {
                this.delta = 0.0
                this.value = this.target
            }
        }
        return this.value
    }

    @inline equals(value: f64): bool { return this.value == value }
}

export abstract class Voice {
    running: bool = false
    protected stopping: bool = false
    protected level: f64 = 0.0 // dB offset from velocity and accent
    protected readonly gain: Interpolator = new Interpolator()
    protected sampleRate: f64 = 44100.0
    protected sampleRateInv: f64 = 1.0 / 44100.0

    constructor(protected readonly params: Params) {}

    setSampleRate(sampleRate: f64): void {
        this.sampleRate = sampleRate
        this.sampleRateInv = 1.0 / sampleRate
        this.gain.init(sampleRate)
    }

    start(step: u8, level: f64): void {
        this.running = true
        this.stopping = false
        this.level = level
        this.gain.set(NaN, false)
        this.begin(step)
        this.update()
    }

    // Fades out quickly, the voice stops following its parameters
    stop(): void {
        this.stopping = true
        this.gain.set(0.0, true)
    }

    protected abstract begin(step: u8): void

    // Follows parameter changes, called once per block
    abstract update(): void

    // Adds to the mix, returns false when done
    abstract process(output: usize, from: i32, to: i32): bool
}

class SampleConfig {
    constructor(readonly ptr: usize,
                readonly length: i32,
                readonly levelId: i32,
                readonly tuneId: i32,
                readonly decayId: i32,
                readonly releaseStartTime: f64) {}
}

const TomLowConfig = new SampleConfig(S.TOM_LOW, S.TOM_LOW_LENGTH, ParamId.TomLowLevel, ParamId.TomLowTune, ParamId.TomLowDecay, 0.030)
const TomMidConfig = new SampleConfig(S.TOM_MID, S.TOM_MID_LENGTH, ParamId.TomMidLevel, ParamId.TomMidTune, ParamId.TomMidDecay, 0.030)
const TomHiConfig = new SampleConfig(S.TOM_HI, S.TOM_HI_LENGTH, ParamId.TomHiLevel, ParamId.TomHiTune, ParamId.TomHiDecay, 0.030)
const RimConfig = new SampleConfig(S.RIM, S.RIM_LENGTH, ParamId.RimLevel, NO_PARAM, NO_PARAM, 0.0)
const ClapConfig = new SampleConfig(S.CLAP, S.CLAP_LENGTH, ParamId.ClapLevel, NO_PARAM, NO_PARAM, 0.0)
const ClosedHihatConfig = new SampleConfig(S.CLOSED_HIHAT, S.CLOSED_HIHAT_LENGTH, ParamId.HihatLevel, NO_PARAM, ParamId.ClosedHihatDecay, 0.006)
const OpenedHihatConfig = new SampleConfig(S.OPENED_HIHAT, S.OPENED_HIHAT_LENGTH, ParamId.HihatLevel, NO_PARAM, ParamId.OpenedHihatDecay, 0.012)
const CrashConfig = new SampleConfig(S.CRASH, S.CRASH_LENGTH, ParamId.CrashLevel, ParamId.CrashTune, NO_PARAM, 0.0)
const RideConfig = new SampleConfig(S.RIDE, S.RIDE_LENGTH, ParamId.RideLevel, ParamId.RideTune, NO_PARAM, 0.0)

function sampleConfig(channel: i32, step: u8): SampleConfig {
    switch (channel) {
        case Channel.TomLow: return TomLowConfig
        case Channel.TomMid: return TomMidConfig
        case Channel.TomHi: return TomHiConfig
        case Channel.Rim: return RimConfig
        case Channel.Clap: return ClapConfig
        case Channel.Hihat: return step == Step.Extra ? OpenedHihatConfig : ClosedHihatConfig
        case Channel.Crash: return CrashConfig
        default: return RideConfig
    }
}

export class SampleVoice extends Voice {
    private config: SampleConfig = RideConfig
    private position: f64 = 0.0
    private frame: i32 = 0
    private releaseStartFrame: i32 = 0
    private rate: f64 = 1.0
    private envelope: f64 = 1.0
    private envelopeCoefficient: f64 = 1.0

    constructor(params: Params, private readonly channel: i32) {super(params)}

    protected begin(step: u8): void {
        this.config = sampleConfig(this.channel, step)
        this.position = 0.0
        this.frame = 0
        this.releaseStartFrame = <i32>(this.config.releaseStartTime * this.sampleRate)
        this.envelope = 1.0
        this.envelopeCoefficient = 1.0
    }

    update(): void {
        if (this.stopping) return
        const config = this.config
        const params = this.params
        this.gain.set(dbToGain(params.plain(config.levelId) + this.level), true)
        this.rate = RESOURCE_SAMPLE_RATE * this.sampleRateInv
        if (config.tuneId != NO_PARAM) this.rate *= Math.pow(2.0, params.plain(config.tuneId))
        if (config.decayId != NO_PARAM) this.envelopeCoefficient = Math.exp(-1.0 / (this.sampleRate * params.plain(config.decayId)))
    }

    process(output: usize, from: i32, to: i32): bool {
        const ptr = this.config.ptr
        const last = this.config.length - 1
        for (let i = from; i < to; i++) {
            const pi = <i32>this.position
            if (pi >= last) return false
            if (this.frame++ >= this.releaseStartFrame) this.envelope *= this.envelopeCoefficient
            const v0 = <f64>load<f32>(ptr + (<usize>pi << 2))
            const v1 = <f64>load<f32>(ptr + (<usize>(pi + 1) << 2))
            const alpha = this.position - <f64>pi
            const out = output + (<usize>i << 2)
            store<f32>(out, load<f32>(out) + <f32>((v0 + alpha * (v1 - v0)) * this.envelope * this.gain.moveAndGet()))
            this.position += this.rate
        }
        return !this.gain.equals(0.0)
    }
}

export class BassdrumVoice extends Voice {
    static readonly ReleaseStartTime: f64 = 0.060
    static readonly FreqStart: f64 = 274.0
    static readonly FreqEnd: f64 = 53.0

    private attackGain: f64 = 0.0
    private attackRate: f64 = 1.0
    private gainEnvelope: f64 = 1.0
    private gainCoefficient: f64 = 1.0
    private freqEnvelope: f64 = BassdrumVoice.FreqStart
    private freqCoefficient: f64 = 1.0
    private time: f64 = 0.0
    private phase: f64 = 0.0
    private attackPosition: f64 = 0.0

    protected begin(_step: u8): void {
        const params = this.params
        this.gainEnvelope = 1.0
        this.freqEnvelope = BassdrumVoice.FreqStart
        this.time = 0.0
        this.phase = 0.0
        this.attackPosition = 0.0
        this.attackGain = dbToGain(params.plain(ParamId.BassdrumAttack) + params.plain(ParamId.BassdrumLevel) + this.level)
        this.attackRate = RESOURCE_SAMPLE_RATE * this.sampleRateInv
    }

    update(): void {
        if (this.stopping) return
        const params = this.params
        this.gain.set(dbToGain(params.plain(ParamId.BassdrumLevel) + this.level), true)
        this.gainCoefficient = Math.exp(-1.0 / (this.sampleRate * params.plain(ParamId.BassdrumDecay)))
        this.freqCoefficient = Math.exp(-1.0 / (this.sampleRate * params.plain(ParamId.BassdrumTune)))
    }

    process(output: usize, from: i32, to: i32): bool {
        const cycleLength = S.BASSDRUM_CYCLE_LENGTH
        const attackLast = <f64>(S.BASSDRUM_ATTACK_LENGTH - 1)
        for (let i = from; i < to; i++) {
            if (this.time > BassdrumVoice.ReleaseStartTime) this.gainEnvelope *= this.gainCoefficient
            const pos = this.phase * <f64>cycleLength
            const posInt = <i32>Math.floor(pos)
            const alpha = pos - <f64>posInt
            const c0 = <f64>load<f32>(S.BASSDRUM_CYCLE + (<usize>(posInt % cycleLength) << 2))
            const c1 = <f64>load<f32>(S.BASSDRUM_CYCLE + (<usize>((posInt + 1) % cycleLength) << 2))
            let value = (c0 + alpha * (c1 - c0)) * this.gainEnvelope * this.gain.moveAndGet()
            if (this.attackPosition < attackLast) {
                const pi = <i32>this.attackPosition
                const a0 = <f64>load<f32>(S.BASSDRUM_ATTACK + (<usize>pi << 2))
                const a1 = <f64>load<f32>(S.BASSDRUM_ATTACK + (<usize>(pi + 1) << 2))
                value += (a0 + (this.attackPosition - <f64>pi) * (a1 - a0)) * this.attackGain
                this.attackPosition += this.attackRate
            }
            const out = output + (<usize>i << 2)
            store<f32>(out, load<f32>(out) + <f32>value)
            this.time += this.sampleRateInv
            this.phase += this.freqEnvelope * this.sampleRateInv
            this.phase -= Math.floor(this.phase)
            this.freqEnvelope = BassdrumVoice.FreqEnd + this.freqCoefficient * (this.freqEnvelope - BassdrumVoice.FreqEnd)
        }
        return this.gainEnvelope > SILENT_GAIN && !this.gain.equals(0.0)
    }
}

export class SnaredrumVoice extends Voice {
    private tonePosition: f64 = 0.0
    private toneRate: f64 = 1.0
    private noisePosition: f64 = 0.0
    private noiseRate: f64 = 1.0
    private noiseGain: f64 = 1.0
    private noiseGainCoefficient: f64 = 1.0

    protected begin(_step: u8): void {
        const params = this.params
        this.tonePosition = 0.0
        this.noisePosition = 0.0
        this.toneRate = RESOURCE_SAMPLE_RATE * this.sampleRateInv * Math.pow(2.0, params.plain(ParamId.SnaredrumTune))
        this.noiseRate = RESOURCE_SAMPLE_RATE * this.sampleRateInv
        this.noiseGain = dbToGain(params.plain(ParamId.SnaredrumSnappy))
    }

    update(): void {
        if (this.stopping) return
        const params = this.params
        this.gain.set(dbToGain(params.plain(ParamId.SnaredrumLevel) + this.level), true)
        this.noiseGainCoefficient = Math.exp(-1.0 / (this.sampleRate * params.plain(ParamId.SnaredrumTone)))
    }

    process(output: usize, from: i32, to: i32): bool {
        const toneLast = S.SNARE_TONE_LENGTH - 1
        const noiseLast = S.SNARE_NOISE_LENGTH - 1
        for (let i = from; i < to; i++) {
            const gain = this.gain.moveAndGet()
            let value: f64 = 0.0
            const ti = <i32>this.tonePosition
            if (ti < toneLast) {
                const t0 = <f64>load<f32>(S.SNARE_TONE + (<usize>ti << 2))
                const t1 = <f64>load<f32>(S.SNARE_TONE + (<usize>(ti + 1) << 2))
                value += (t0 + (this.tonePosition - <f64>ti) * (t1 - t0)) * gain
                this.tonePosition += this.toneRate
            }
            const ni = <i32>this.noisePosition
            if (ni >= noiseLast) return false
            const n0 = <f64>load<f32>(S.SNARE_NOISE + (<usize>ni << 2))
            const n1 = <f64>load<f32>(S.SNARE_NOISE + (<usize>(ni + 1) << 2))
            value += (n0 + (this.noisePosition - <f64>ni) * (n1 - n0)) * gain * this.noiseGain
            this.noiseGain *= this.noiseGainCoefficient
            this.noisePosition += this.noiseRate
            const out = output + (<usize>i << 2)
            store<f32>(out, load<f32>(out) + <f32>value)
        }
        return !(this.gain.equals(0.0) || this.noiseGain < SILENT_GAIN)
    }
}

// ---------------------------------------------------------------------------------------------------------------
// A channel plays one instrument: hits are queued with an absolute frame index (flams land in later blocks),
// a new hit fades out the previous one (909 voices are monophonic per instrument).

const POOL_SIZE: i32 = 4
const QUEUE_SIZE: i32 = 64

export class ChannelPlayer {
    private readonly voices: StaticArray<Voice> = new StaticArray<Voice>(POOL_SIZE)
    private readonly queueFrames: StaticArray<i64> = new StaticArray<i64>(QUEUE_SIZE)
    private readonly queueSteps: StaticArray<u8> = new StaticArray<u8>(QUEUE_SIZE)
    private readonly queueLevels: StaticArray<f64> = new StaticArray<f64>(QUEUE_SIZE)
    private queueCount: i32 = 0
    private active: i32 = -1

    constructor(params: Params, readonly channel: i32) {
        for (let i = 0; i < POOL_SIZE; i++) {
            let voice: Voice
            if (channel == Channel.Bassdrum) voice = new BassdrumVoice(params)
            else if (channel == Channel.Snaredrum) voice = new SnaredrumVoice(params)
            else voice = new SampleVoice(params, channel)
            unchecked(this.voices[i] = voice)
        }
    }

    setSampleRate(sampleRate: f64): void {
        for (let i = 0; i < POOL_SIZE; i++) unchecked(this.voices[i]).setSampleRate(sampleRate)
    }

    schedule(frame: i64, step: u8, level: f64): void {
        if (this.queueCount == QUEUE_SIZE) return
        let index = this.queueCount++
        while (index > 0 && unchecked(this.queueFrames[index - 1]) > frame) {
            unchecked(this.queueFrames[index] = this.queueFrames[index - 1])
            unchecked(this.queueSteps[index] = this.queueSteps[index - 1])
            unchecked(this.queueLevels[index] = this.queueLevels[index - 1])
            index--
        }
        unchecked(this.queueFrames[index] = frame)
        unchecked(this.queueSteps[index] = step)
        unchecked(this.queueLevels[index] = level)
    }

    reset(): void {
        this.queueCount = 0
        this.active = -1
        for (let i = 0; i < POOL_SIZE; i++) unchecked(this.voices[i]).running = false
    }

    // Adds frames [blockStart, blockStart + count) to the mix
    process(output: usize, blockStart: i64, count: i32): void {
        for (let i = 0; i < POOL_SIZE; i++) {
            const voice = unchecked(this.voices[i])
            if (voice.running) voice.update()
        }
        let position = 0
        const end = blockStart + <i64>count
        while (this.queueCount > 0 && unchecked(this.queueFrames[0]) < end) {
            const offset = <i32>max<i64>(0, unchecked(this.queueFrames[0]) - blockStart)
            const step = unchecked(this.queueSteps[0])
            const level = unchecked(this.queueLevels[0])
            this.queueCount--
            for (let i = 0; i < this.queueCount; i++) {
                unchecked(this.queueFrames[i] = this.queueFrames[i + 1])
                unchecked(this.queueSteps[i] = this.queueSteps[i + 1])
                unchecked(this.queueLevels[i] = this.queueLevels[i + 1])
            }
            this.advance(output, position, offset)
            if (this.active >= 0) unchecked(this.voices[this.active]).stop()
            this.active = this.freeVoice()
            unchecked(this.voices[this.active]).start(step, level)
            position = offset
        }
        if (position < count) this.advance(output, position, count)
    }

    private freeVoice(): i32 {
        for (let i = 0; i < POOL_SIZE; i++) {
            if (i != this.active && !unchecked(this.voices[i]).running) return i
        }
        // all busy: take the next one after the active voice (the oldest fading one)
        return (this.active + 1) % POOL_SIZE
    }

    private advance(output: usize, from: i32, to: i32): void {
        if (from >= to) return
        for (let i = 0; i < POOL_SIZE; i++) {
            const voice = unchecked(this.voices[i])
            if (voice.running && !voice.process(output, from, to)) {
                voice.running = false
                if (this.active == i) this.active = -1
            }
        }
    }
}
