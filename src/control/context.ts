import {Arrays, DefaultObservableValue, DefaultParameter, int, Terminable, Terminator} from "@opendaw/lib-std"
import {AnimationFrame} from "@opendaw/lib-dom"
import {NUM_PAGES, NUM_PATTERNS, NUM_STEPS, Pattern, ScaleIndex, STEPS_PER_PAGE} from "@/audio/pattern"
import {Preset} from "@/audio/preset"
import {Connection} from "@/plugin/connection"
import {Frames, Position, Snapshot} from "@/plugin/protocol"
import {DisplayValue} from "./display"
import {Instrument} from "./instrument"
import {FunctionKeyIndex, KeyGroup, KeyState} from "./keys"

const MAX_SHUFFLE = 6

// The page side of the plugin: the edited pattern and instrument, the keys and their lights.
// Patterns and parameters live in the plugin, the page keeps copies and sends every edit.
export class UIContext implements Terminable {
    readonly #terminator: Terminator = new Terminator()
    readonly #connection: Connection
    readonly #patternWatch: Terminator

    readonly preset: Preset
    readonly patterns: ReadonlyArray<Pattern>
    readonly stepKeys: KeyGroup
    readonly instrumentKeys: KeyGroup
    readonly patternKeys: KeyGroup
    readonly pageKeys: KeyGroup
    readonly lengthKeys: KeyGroup
    readonly functionKeys: KeyGroup
    readonly instrument: DefaultObservableValue<Instrument>
    readonly editPattern: DefaultObservableValue<int>
    readonly editPage: DefaultObservableValue<int>
    readonly display: DefaultObservableValue<DisplayValue>
    readonly scaleIndex: DefaultObservableValue<ScaleIndex>
    readonly position: DefaultObservableValue<Position>
    readonly blinkPhase: DefaultObservableValue<boolean>
    readonly flashPhase: DefaultObservableValue<boolean>

    #remoteUpdate: boolean = false
    #clipboard: Uint8Array | null = null

    constructor(connection: Connection) {
        this.#connection = connection
        this.preset = this.#terminator.own(new Preset())
        this.patterns = Arrays.create(index => this.#terminator.own(new Pattern(index)), NUM_PATTERNS)
        this.stepKeys = new KeyGroup(STEPS_PER_PAGE)
        this.instrumentKeys = new KeyGroup(Instrument.All.length)
        this.patternKeys = new KeyGroup(NUM_PATTERNS)
        this.pageKeys = new KeyGroup(NUM_PAGES)
        this.lengthKeys = new KeyGroup(2)
        this.functionKeys = new KeyGroup(FunctionKeyIndex.Paste + 1)
        this.instrument = this.#terminator.own(new DefaultObservableValue<Instrument>(Instrument.Bassdrum))
        this.editPattern = this.#terminator.own(new DefaultObservableValue<int>(0))
        this.editPage = this.#terminator.own(new DefaultObservableValue<int>(0))
        this.display = this.#terminator.own(new DefaultObservableValue<DisplayValue>(16))
        this.scaleIndex = this.#terminator.own(new DefaultObservableValue<ScaleIndex>(3))
        this.position = this.#terminator.own(new DefaultObservableValue<Position>({playing: 0, queued: -1, step: -1}))
        this.blinkPhase = this.#terminator.own(new DefaultObservableValue<boolean>(false))
        this.flashPhase = this.#terminator.own(new DefaultObservableValue<boolean>(false))
        this.#patternWatch = this.#terminator.own(new Terminator())
        this.#terminator.ownAll(
            ...this.preset.parameters().map((parameter, id) => parameter.subscribe(owner => {
                if (!this.#remoteUpdate) {connection.send(Frames.param(id, owner.getUnitValue()))}
            })),
            connection.subscribe(message => {
                switch (message.type) {
                    case "snapshot":
                        this.#applySnapshot(message.snapshot)
                        break
                    case "param":
                        this.#applyParameter(message.id, message.value)
                        break
                    case "position":
                        this.position.setValue(message.position)
                        break
                }
            }),
            this.instrument.catchupAndSubscribe(() => {
                this.instrumentKeys.activate(index => Instrument.All[index] === this.instrument.getValue() ? KeyState.On : KeyState.Off)
                this.#updateStepKeys()
            }),
            this.editPattern.catchupAndSubscribe(owner => this.#watchPattern(this.patterns[owner.getValue()])),
            this.editPage.subscribe(() => {
                this.#updateStepKeys()
                this.#updatePageKeys()
                this.#updateRunningStep()
            }),
            this.position.catchupAndSubscribe(() => {
                this.#updatePatternKeys()
                this.#updatePageKeys()
                this.#updateRunningStep()
            })
        )
        this.#installPhases()
        connection.send(Frames.hello())
    }

    // Knob gestures, so hosts record automation as one move
    beginGesture(parameter: DefaultParameter<number>): void {this.#gesture(parameter, true)}

    endGesture(parameter: DefaultParameter<number>): void {this.#gesture(parameter, false)}

    // keyIndex is the key (0...15) in the edit range. A click cycles none → normal → accent, shift goes to accent.
    pressStepKey(keyIndex: int, accent: boolean = false): void {
        this.stepKeys.byIndex(keyIndex).setPressed(true)
        const pattern = this.activePattern()
        const stepIndex = this.editPage.getValue() * STEPS_PER_PAGE + keyIndex
        const instrument = this.instrument.getValue()
        if (accent) {
            instrument.accentStep(pattern, stepIndex)
        } else {
            instrument.toggleStep(pattern, stepIndex)
        }
        this.#sendPattern(pattern)
    }

    releaseStepKey(keyIndex: int): void {this.stepKeys.byIndex(keyIndex).setPressed(false)}

    pressFunctionKey(index: FunctionKeyIndex): void {
        const key = this.functionKeys.byIndex(index)
        key.setPressed(true)
        const pattern = this.activePattern()
        switch (index) {
            case FunctionKeyIndex.Clear:
                this.instrument.getValue().clear(pattern)
                break
            case FunctionKeyIndex.Scale:
                pattern.cycleToNextScale()
                break
            case FunctionKeyIndex.Shuffle:
                // held: the display shows the shuffle, - and + change it
                key.setState(KeyState.On)
                this.#updateDisplay()
                return
            case FunctionKeyIndex.Double:
                pattern.double()
                break
            case FunctionKeyIndex.Copy:
                this.#clipboard = pattern.toBytes()
                this.functionKeys.byIndex(FunctionKeyIndex.Paste).setState(KeyState.On)
                return
            case FunctionKeyIndex.Paste:
                if (this.#clipboard === null) {return}
                pattern.fromBytes(this.#clipboard)
                break
        }
        this.#sendPattern(pattern)
    }

    releaseFunctionKey(index: FunctionKeyIndex): void {
        const key = this.functionKeys.byIndex(index)
        key.setPressed(false)
        if (index === FunctionKeyIndex.Shuffle) {
            key.setState(KeyState.Off)
            this.#updateDisplay()
        }
    }

    selectInstrument(index: int): void {this.instrument.setValue(Instrument.All[index])}

    // - and + change the length, or the shuffle while SHUFFLE is held
    changeLength(delta: int): void {
        const pattern = this.activePattern()
        if (this.#isShufflePressed()) {
            const shuffle = Math.max(0, Math.min(MAX_SHUFFLE, pattern.shuffleIndex.getValue() + delta))
            if (shuffle === pattern.shuffleIndex.getValue()) {return}
            pattern.shuffleIndex.setValue(shuffle)
            this.#sendPattern(pattern)
            return
        }
        const length = Math.max(1, Math.min(NUM_STEPS, pattern.lastStep.getValue() + delta))
        if (length === pattern.lastStep.getValue()) {return}
        pattern.lastStep.setValue(length)
        this.#sendPattern(pattern)
    }

    // Selects the 16 steps the step keys edit
    selectPage(index: int): void {this.editPage.setValue(index)}

    // While the host plays, the plugin switches at the end of the running pattern
    selectPattern(index: int): void {
        this.editPattern.setValue(index)
        this.#connection.send(Frames.select(index))
    }

    activePattern(): Pattern {return this.patterns[this.editPattern.getValue()]}

    terminate(): void {this.#terminator.terminate()}

    #gesture(parameter: DefaultParameter<number>, begin: boolean): void {
        const id = this.preset.parameters().indexOf(parameter)
        if (id >= 0) {this.#connection.send(Frames.gesture(id, begin))}
    }

    #sendPattern(pattern: Pattern): void {this.#connection.send(Frames.pattern(pattern.index, pattern.toBytes()))}

    #applySnapshot({values, position, patterns}: Snapshot): void {
        values.forEach((value, id) => this.#applyParameter(id, value))
        patterns.forEach((bytes, index) => this.patterns[index].fromBytes(bytes))
        this.position.setValue(position)
        this.editPattern.setValue(position.queued >= 0 ? position.queued : position.playing)
    }

    #applyParameter(id: int, value: number): void {
        const parameter = this.preset.parameters().at(id)
        if (parameter === undefined) {return}
        this.#remoteUpdate = true
        parameter.setUnitValue(value)
        this.#remoteUpdate = false
    }

    #watchPattern(pattern: Pattern): void {
        this.#patternWatch.terminate()
        this.#patternWatch.ownAll(
            pattern.catchupAndSubscribe(() => this.#updateStepKeys()),
            pattern.scaleIndex.catchupAndSubscribe(owner => this.scaleIndex.setValue(owner.getValue())),
            pattern.lastStep.subscribe(() => this.#updateDisplay()),
            pattern.shuffleIndex.subscribe(() => this.#updateDisplay())
        )
        this.#updateDisplay()
        this.#updatePatternKeys()
        this.#updateRunningStep()
    }

    #isShufflePressed(): boolean {return this.functionKeys.byIndex(FunctionKeyIndex.Shuffle).pressed}

    #updateDisplay(): void {
        const pattern = this.activePattern()
        this.display.setValue(this.#isShufflePressed() ? pattern.shuffleIndex.getValue() : pattern.lastStep.getValue())
    }

    // The steps of the edited instrument in the edit range
    #updateStepKeys(): void {
        const pattern = this.activePattern()
        const offset = this.editPage.getValue() * STEPS_PER_PAGE
        const instrument = this.instrument.getValue()
        this.stepKeys.activate(index => instrument.keyState(pattern, offset + index))
    }

    // The edited range is lit, the range the pattern plays in flashes
    #updatePageKeys(): void {
        const {playing, step} = this.position.getValue()
        const edit = this.editPage.getValue()
        const playingPage = playing === this.editPattern.getValue() && step >= 0 ? Math.floor(step / STEPS_PER_PAGE) : -1
        this.pageKeys.activate(index => index === edit ? KeyState.On : index === playingPage ? KeyState.Flash : KeyState.Off)
    }

    // The playing pattern is lit, a pattern waiting for its turn blinks
    #updatePatternKeys(): void {
        const {playing, queued} = this.position.getValue()
        const edit = this.editPattern.getValue()
        this.patternKeys.activate(index =>
            index === queued ? KeyState.Blink : index === playing ? KeyState.On : index === edit ? KeyState.Flash : KeyState.Off)
    }

    #updateRunningStep(): void {
        const {playing, step} = this.position.getValue()
        const visible = playing === this.editPattern.getValue()
        const offset = this.editPage.getValue() * STEPS_PER_PAGE
        this.stepKeys.forEach((key, index) => key.setRunning(visible && offset + index === step))
    }

    #installPhases(): void {
        let frame: int = 0
        this.#terminator.own(AnimationFrame.add(() => {
            frame++
            this.blinkPhase.setValue(frame % 30 < 15)
            this.flashPhase.setValue(frame % 4 < 2)
        }))
    }
}
