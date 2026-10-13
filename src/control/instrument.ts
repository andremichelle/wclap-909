import {int} from "@opendaw/lib-std"
import {ChannelIndex, NUM_STEPS, Pattern, Step} from "@/audio/pattern"
import {KeyState} from "./keys"

// How a step key edits the selected instrument
type Editing = "weak-full" | "full" | "extra"

export class Instrument {
    static readonly Bassdrum = new Instrument(ChannelIndex.Bassdrum, "weak-full", "Bass Drum")
    static readonly Snaredrum = new Instrument(ChannelIndex.Snaredrum, "weak-full", "Snare Drum")
    static readonly TomLow = new Instrument(ChannelIndex.TomLow, "weak-full", "Low Tom")
    static readonly TomMid = new Instrument(ChannelIndex.TomMid, "weak-full", "Mid Tom")
    static readonly TomHi = new Instrument(ChannelIndex.TomHi, "weak-full", "Hi Tom")
    static readonly Rim = new Instrument(ChannelIndex.Rim, "full", "Rim Shot")
    static readonly Clap = new Instrument(ChannelIndex.Clap, "full", "Hand Clap")
    static readonly HihatClosed = new Instrument(ChannelIndex.Hihat, "weak-full", "Closed Hi Hat")
    static readonly HihatOpened = new Instrument(ChannelIndex.Hihat, "extra", "Open Hi Hat")
    static readonly Crash = new Instrument(ChannelIndex.Crash, "full", "Crash")
    static readonly Ride = new Instrument(ChannelIndex.Ride, "full", "Ride")

    // The order of the select keys below the instrument sections
    static readonly All: ReadonlyArray<Instrument> = [
        Instrument.Bassdrum, Instrument.Snaredrum,
        Instrument.TomLow, Instrument.TomMid, Instrument.TomHi,
        Instrument.Rim, Instrument.Clap,
        Instrument.HihatClosed, Instrument.HihatOpened,
        Instrument.Crash, Instrument.Ride
    ]

    private constructor(readonly channelIndex: ChannelIndex, readonly editing: Editing, readonly name: string) {}

    // none → weak → full → none for instruments with two levels, like the hardware
    toggleStep(pattern: Pattern, stepIndex: int): void {
        const channelIndex = this.channelIndex
        const step = pattern.getStep(channelIndex, stepIndex)
        switch (this.editing) {
            case "weak-full":
                pattern.setStep(channelIndex, stepIndex,
                    step === Step.None || step === Step.Extra ? Step.Weak : step === Step.Weak ? Step.Full : Step.None)
                return
            case "full":
                pattern.setStep(channelIndex, stepIndex, step !== Step.Full ? Step.Full : Step.None)
                return
            case "extra":
                pattern.setStep(channelIndex, stepIndex, step !== Step.Extra ? Step.Extra : Step.None)
                return
        }
    }

    // accent (full) or back to none, for instruments with two levels. The others toggle as on a click.
    accentStep(pattern: Pattern, stepIndex: int): void {
        const channelIndex = this.channelIndex
        if (this.editing !== "weak-full") {
            this.toggleStep(pattern, stepIndex)
            return
        }
        pattern.setStep(channelIndex, stepIndex, pattern.getStep(channelIndex, stepIndex) === Step.Full ? Step.None : Step.Full)
    }

    value(pattern: Pattern, stepIndex: int): Step {return pattern.getStep(this.channelIndex, stepIndex)}

    // Sets the step to a value taken from another step (drag painting). Painting 'off' on the hi-hat
    // only removes the selected kind, closed or open.
    paint(pattern: Pattern, stepIndex: int, value: Step): void {
        const channelIndex = this.channelIndex
        if (value === Step.None && channelIndex === ChannelIndex.Hihat
            && (pattern.getStep(channelIndex, stepIndex) === Step.Extra) !== (this.editing === "extra")) {return}
        pattern.setStep(channelIndex, stepIndex, value)
    }

    clear(pattern: Pattern): void {
        const channelIndex = this.channelIndex
        if (channelIndex === ChannelIndex.Hihat) {
            // closed and open share the channel: clear only the selected one
            const extra = this.editing === "extra"
            for (let index = 0; index < NUM_STEPS; index++) {
                const step = pattern.getStep(channelIndex, index)
                if ((step === Step.Extra) === extra) {pattern.setStep(channelIndex, index, Step.None)}
            }
        } else {
            pattern.clearChannel(channelIndex)
        }
    }

    // weak steps flash, full steps are lit
    keyState(pattern: Pattern, stepIndex: int): KeyState {
        const step = pattern.getStep(this.channelIndex, stepIndex)
        if (this.editing === "extra") {return step === Step.Extra ? KeyState.On : KeyState.Off}
        return step === Step.Weak ? KeyState.Flash : step === Step.Full ? KeyState.On : KeyState.Off
    }
}
