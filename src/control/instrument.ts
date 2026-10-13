import {int} from "@opendaw/lib-std"
import {ChannelIndex, NUM_STEPS, Pattern, Step} from "@/audio/pattern"
import {KeyState} from "./keys"

// Each instrument writes its own step values: a normal and an accented one, or only one for instruments with a
// single level. Closed and open hi-hat share a channel but have their own values.
export class Instrument {
    static readonly Bassdrum = new Instrument(ChannelIndex.Bassdrum, Step.Weak, Step.Full, "Bass Drum")
    static readonly Snaredrum = new Instrument(ChannelIndex.Snaredrum, Step.Weak, Step.Full, "Snare Drum")
    static readonly TomLow = new Instrument(ChannelIndex.TomLow, Step.Weak, Step.Full, "Low Tom")
    static readonly TomMid = new Instrument(ChannelIndex.TomMid, Step.Weak, Step.Full, "Mid Tom")
    static readonly TomHi = new Instrument(ChannelIndex.TomHi, Step.Weak, Step.Full, "Hi Tom")
    static readonly Rim = new Instrument(ChannelIndex.Rim, null, Step.Full, "Rim Shot")
    static readonly Clap = new Instrument(ChannelIndex.Clap, null, Step.Full, "Hand Clap")
    static readonly HihatClosed = new Instrument(ChannelIndex.Hihat, Step.Weak, Step.Full, "Closed Hi Hat")
    static readonly HihatOpened = new Instrument(ChannelIndex.Hihat, Step.Extra, Step.ExtraAccent, "Open Hi Hat")
    static readonly Crash = new Instrument(ChannelIndex.Crash, null, Step.Full, "Crash")
    static readonly Ride = new Instrument(ChannelIndex.Ride, null, Step.Full, "Ride")

    // The order of the select keys below the instrument sections
    static readonly All: ReadonlyArray<Instrument> = [
        Instrument.Bassdrum, Instrument.Snaredrum,
        Instrument.TomLow, Instrument.TomMid, Instrument.TomHi,
        Instrument.Rim, Instrument.Clap,
        Instrument.HihatClosed, Instrument.HihatOpened,
        Instrument.Crash, Instrument.Ride
    ]

    private constructor(readonly channelIndex: ChannelIndex,
                        readonly normal: Step | null,
                        readonly accent: Step,
                        readonly name: string) {}

    // none → normal → accent → none (none ↔ accent for instruments with one level)
    toggleStep(pattern: Pattern, stepIndex: int): void {
        const step = pattern.getStep(this.channelIndex, stepIndex)
        const next = step === this.accent ? Step.None
            : step === this.normal || this.normal === null ? this.accent : this.normal
        pattern.setStep(this.channelIndex, stepIndex, next)
    }

    // accent, or back to none on an accented step
    accentStep(pattern: Pattern, stepIndex: int): void {
        const step = pattern.getStep(this.channelIndex, stepIndex)
        pattern.setStep(this.channelIndex, stepIndex, step === this.accent ? Step.None : this.accent)
    }

    value(pattern: Pattern, stepIndex: int): Step {return pattern.getStep(this.channelIndex, stepIndex)}

    // Sets the step to a value taken from another step (drag painting). Painting 'off' on the hi-hat
    // only removes the selected kind, closed or open.
    paint(pattern: Pattern, stepIndex: int, value: Step): void {
        if (value === Step.None && this.channelIndex === ChannelIndex.Hihat
            && !this.#owns(pattern.getStep(this.channelIndex, stepIndex))) {return}
        pattern.setStep(this.channelIndex, stepIndex, value)
    }

    clear(pattern: Pattern): void {
        const channelIndex = this.channelIndex
        if (channelIndex === ChannelIndex.Hihat) {
            // closed and open share the channel: clear only the selected one
            for (let index = 0; index < NUM_STEPS; index++) {
                if (this.#owns(pattern.getStep(channelIndex, index))) {pattern.setStep(channelIndex, index, Step.None)}
            }
        } else {
            pattern.clearChannel(channelIndex)
        }
    }

    // normal steps flash, accented steps are lit
    keyState(pattern: Pattern, stepIndex: int): KeyState {
        const step = pattern.getStep(this.channelIndex, stepIndex)
        return step === this.accent ? KeyState.On : step === this.normal ? KeyState.Flash : KeyState.Off
    }

    #owns(step: Step): boolean {return step !== Step.None && (step === this.normal || step === this.accent)}
}
