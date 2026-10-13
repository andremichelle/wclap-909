import css from "./TR909.sass?inline"
import {Arrays, Exec, int, Lifecycle, Terminable} from "@opendaw/lib-std"
import {Html} from "@opendaw/lib-dom"
import {createElement} from "@opendaw/lib-jsx"
import {UIContext} from "@/control/context"
import {ActionGroup} from "./ActionGroup"
import {FunctionKey} from "./FunctionKey"
import {Instruments} from "./Instruments"
import {Knob} from "./Knob"
import {LedDisplay} from "./LedDisplay"
import {MainKeys} from "./MainKeys"
import {PatternFunctions} from "./PatternFunctions"
import {Scales} from "./Scales"

const className = Html.adoptStyleSheet(css, "TR909")

// Runs once on press, then repeatedly while held
class Repeat implements Terminable {
    #timeout: ReturnType<typeof setTimeout> | undefined = undefined

    constructor(readonly exec: Exec) {}

    start(): void {
        this.stop()
        this.exec()
        const next = (delay: number) => this.#timeout = setTimeout(() => {
            this.exec()
            next(80)
        }, delay)
        next(400)
    }

    stop(): void {
        clearTimeout(this.#timeout)
        this.#timeout = undefined
    }

    terminate(): void {this.stop()}
}

const at = (x: number, y: number): Partial<CSSStyleDeclaration> => ({transform: `translate(${x}px, ${y}px)`})

type Construct = {
    lifecycle: Lifecycle
    ui: UIContext
}

export const TR909 = ({lifecycle, ui}: Construct) => {
    const {preset} = ui
    const patternKeys = Arrays.create(index => (
        <FunctionKey lifecycle={lifecycle} model={ui.patternKeys.byIndex(index)}
                     title={`Pattern ${index + 1}`}
                     onPress={() => ui.selectPattern(index)}/>
    ), ui.patternKeys.keys.length)
    const lengthKey = (index: int, delta: int, title: string) => {
        const repeat = new Repeat(() => ui.changeLength(delta))
        lifecycle.own(repeat)
        return (
            <FunctionKey lifecycle={lifecycle} model={ui.lengthKeys.byIndex(index)} title={title}
                         onPress={() => {
                             ui.lengthKeys.byIndex(index).setPressed(true)
                             repeat.start()
                         }}
                         onRelease={() => {
                             ui.lengthKeys.byIndex(index).setPressed(false)
                             repeat.stop()
                         }}/>
        )
    }
    const pageKeys = Arrays.create(index => (
        <FunctionKey lifecycle={lifecycle} model={ui.pageKeys.byIndex(index)}
                     title={`Edit steps ${index * 16 + 1}-${index * 16 + 16}`}
                     onPress={() => ui.selectPage(index)}/>
    ), ui.pageKeys.keys.length)
    const element: HTMLDivElement = (
        <div className={className}>
            <div className="logo wc-909"/>
            <Instruments lifecycle={lifecycle} ui={ui} style={at(66, 108)}/>
            <div style={at(66, 316)}>
                <LedDisplay lifecycle={lifecycle} value={ui.display}/>
            </div>
            <ActionGroup columns={2} style={at(148, 308)}>
                <h1 style={{gridColumn: "1 / 3"}}>LENGTH</h1>
                {lengthKey(0, -1, "Shortens the pattern by one step, or less shuffle while SHUFFLE is held (hold to repeat)")}
                {lengthKey(1, 1, "Lengthens the pattern by one step, or more shuffle while SHUFFLE is held (hold to repeat)")}
                <span>−</span>
                <span>+</span>
            </ActionGroup>
            <ActionGroup columns={4} style={at(266, 308)}>
                <h1 style={{gridColumn: "1 / 5"}}>EDIT STEPS</h1>
                {pageKeys}
                {pageKeys.map((_, index) => <span>{index * 16 + 1}-{index * 16 + 16}</span>)}
            </ActionGroup>
            <ActionGroup columns={8} style={at(446, 308)}>
                <h1 style={{gridColumn: "1 / 9"}}>PATTERN</h1>
                {patternKeys}
                {patternKeys.map((_, index) => <span>{index + 1}</span>)}
            </ActionGroup>
            <PatternFunctions lifecycle={lifecycle} ui={ui} style={at(66, 396)}/>
            <Scales lifecycle={lifecycle} scaleIndex={ui.scaleIndex} style={at(174, 396)}/>
            <MainKeys lifecycle={lifecycle} ui={ui} style={at(188, 480)}/>
            <hr className="bottom-right" style={at(1096, 396)}/>
            <Knob lifecycle={lifecycle} parameter={preset.volume} label="VOLUME" big units={["MIN", "MAX"]}
                  onGestureBegin={() => ui.beginGesture(preset.volume)}
                  onGestureEnd={() => ui.endGesture(preset.volume)}
                  style={at(1014, 292)}/>
            <footer/>
        </div>
    )
    lifecycle.ownAll(
        ui.blinkPhase.catchupAndSubscribe(owner => element.classList.toggle("blink-phase", owner.getValue())),
        ui.flashPhase.catchupAndSubscribe(owner => element.classList.toggle("flash-phase", owner.getValue()))
    )
    return element
}
