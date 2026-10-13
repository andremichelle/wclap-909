import {Arrays, DefaultObservableValue, int, Notifier, Observer, Subscription, Terminable, Terminator} from "@opendaw/lib-std"

// Weak is a normal step, Full an accented one. 'Extra' is 'Flam' for bassdrum, snaredrum and toms or 'Open'
// for hihat, ExtraAccent the same accented.
export enum Step {None = 0, Weak = 1, Full = 2, Extra = 3, ExtraAccent = 4}

export type ScaleIndex = 0 | 1 | 2 | 3

export enum ChannelIndex {
    Bassdrum, Snaredrum,
    TomLow, TomMid, TomHi,
    Rim, Clap,
    Hihat, Crash, Ride,
    End
}

export const NUM_PATTERNS = 8
export const NUM_STEPS = 64
export const STEPS_PER_PAGE = 16
export const NUM_PAGES = NUM_STEPS / STEPS_PER_PAGE

// The byte layout the plugin keeps (dsp/assembly/patterns.ts)
export namespace PatternLayout {
    export const Steps = 0
    export const Accents = ChannelIndex.End * NUM_STEPS
    export const LastStep = Accents + NUM_STEPS
    export const Scale = LastStep + 1
    export const Shuffle = LastStep + 2
    export const Flam = LastStep + 3
    export const Size = LastStep + 4
}

export class Pattern implements Terminable {
    readonly #terminator: Terminator = new Terminator()
    readonly #notifier: Notifier<Pattern>
    readonly #steps: Step[][]
    readonly #totalAccents: boolean[]

    readonly lastStep: DefaultObservableValue<int>
    readonly scaleIndex: DefaultObservableValue<ScaleIndex>
    readonly shuffleIndex: DefaultObservableValue<int>

    #flamIndex: int = 0
    #muted: boolean = false

    constructor(readonly index: int) {
        this.#notifier = this.#terminator.own(new Notifier<Pattern>())
        this.#steps = Arrays.create(() => Arrays.create(() => Step.None, NUM_STEPS), ChannelIndex.End)
        this.#totalAccents = Arrays.create(() => false, NUM_STEPS)
        this.lastStep = this.#terminator.own(new DefaultObservableValue<int>(16))
        this.scaleIndex = this.#terminator.own(new DefaultObservableValue<ScaleIndex>(3))
        this.shuffleIndex = this.#terminator.own(new DefaultObservableValue<int>(0))
        this.#terminator.ownAll(
            this.lastStep.subscribe(() => this.#notify()),
            this.scaleIndex.subscribe(() => this.#notify()),
            this.shuffleIndex.subscribe(() => this.#notify())
        )
    }

    setStep(channelIndex: ChannelIndex, stepIndex: int, step: Step): void {
        if (this.#steps[channelIndex][stepIndex] === step) {return}
        this.#steps[channelIndex][stepIndex] = step
        this.#notify()
    }

    getStep(channelIndex: ChannelIndex, stepIndex: int): Step {return this.#steps[channelIndex][stepIndex]}

    setTotalAccent(stepIndex: int, active: boolean): void {
        if (this.#totalAccents[stepIndex] === active) {return}
        this.#totalAccents[stepIndex] = active
        this.#notify()
    }

    isTotalAccent(stepIndex: int): boolean {return this.#totalAccents[stepIndex]}

    cycleToNextScale(): void {this.scaleIndex.setValue((this.scaleIndex.getValue() + 5) % 4 as ScaleIndex)}

    clearChannel(channelIndex: ChannelIndex): void {
        this.#batch(() => this.#steps[channelIndex].fill(Step.None))
    }

    clearTotalAccents(): void {this.#batch(() => this.#totalAccents.fill(false))}

    // Repeats the pattern once: steps 1...length are copied behind it, as far as 64 steps allow
    double(): void {
        const length = this.lastStep.getValue()
        const doubled = Math.min(NUM_STEPS, length * 2)
        if (doubled === length) {return}
        this.#batch(() => {
            for (let index = length; index < doubled; index++) {
                this.#steps.forEach(steps => steps[index] = steps[index - length])
                this.#totalAccents[index] = this.#totalAccents[index - length]
            }
            this.lastStep.setValue(doubled)
        })
    }

    toBytes(): Uint8Array {
        const bytes = new Uint8Array(PatternLayout.Size)
        this.#steps.forEach((steps, channel) => bytes.set(steps, PatternLayout.Steps + channel * NUM_STEPS))
        this.#totalAccents.forEach((accent, index) => bytes[PatternLayout.Accents + index] = accent ? 1 : 0)
        bytes[PatternLayout.LastStep] = this.lastStep.getValue()
        bytes[PatternLayout.Scale] = this.scaleIndex.getValue()
        bytes[PatternLayout.Shuffle] = this.shuffleIndex.getValue()
        bytes[PatternLayout.Flam] = this.#flamIndex
        return bytes
    }

    // Applies a pattern sent by the plugin
    fromBytes(bytes: Uint8Array): void {
        this.#batch(() => {
            this.#steps.forEach((steps, channel) => {
                for (let index = 0; index < NUM_STEPS; index++) {
                    steps[index] = bytes[PatternLayout.Steps + channel * NUM_STEPS + index] as Step
                }
            })
            for (let index = 0; index < NUM_STEPS; index++) {
                this.#totalAccents[index] = bytes[PatternLayout.Accents + index] !== 0
            }
            this.lastStep.setValue(bytes[PatternLayout.LastStep])
            this.scaleIndex.setValue(bytes[PatternLayout.Scale] as ScaleIndex)
            this.shuffleIndex.setValue(bytes[PatternLayout.Shuffle])
            this.#flamIndex = bytes[PatternLayout.Flam]
        })
    }

    subscribe(observer: Observer<Pattern>): Subscription {return this.#notifier.subscribe(observer)}

    catchupAndSubscribe(observer: Observer<Pattern>): Subscription {
        observer(this)
        return this.#notifier.subscribe(observer)
    }

    terminate(): void {this.#terminator.terminate()}

    #batch(exec: () => void): void {
        this.#muted = true
        exec()
        this.#muted = false
        this.#notify()
    }

    #notify(): void {if (!this.#muted) {this.#notifier.notify(this)}}
}
