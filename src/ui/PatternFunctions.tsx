import css from "./PatternFunctions.sass?inline"
import {Lifecycle} from "@opendaw/lib-std"
import {Html} from "@opendaw/lib-dom"
import {createElement} from "@opendaw/lib-jsx"
import {UIContext} from "@/control/context"
import {FunctionKeyIndex} from "@/control/keys"
import {FunctionKey} from "./FunctionKey"

const className = Html.adoptStyleSheet(css, "PatternFunctions")

type Construct = {
    lifecycle: Lifecycle
    ui: UIContext
    style?: Partial<CSSStyleDeclaration>
}

const Titles: Record<FunctionKeyIndex, string> = {
    [FunctionKeyIndex.Clear]: "Clears the selected instrument in the pattern",
    [FunctionKeyIndex.Scale]: "Cycles the scale of the pattern",
    [FunctionKeyIndex.Shuffle]: "Shows the shuffle on the display, - and + change it. Click again for the length.",
    [FunctionKeyIndex.Double]: "Repeats the pattern once and doubles its length (up to 64 steps)",
    [FunctionKeyIndex.Copy]: "Copies the pattern",
    [FunctionKeyIndex.Paste]: "Replaces the pattern with the copied one"
}

export const PatternFunctions = ({lifecycle, ui, style}: Construct) => {
    const key = (index: FunctionKeyIndex) => (
        <FunctionKey lifecycle={lifecycle} model={ui.functionKeys.byIndex(index)} title={Titles[index]}
                     onPress={() => ui.pressFunctionKey(index)}
                     onRelease={() => ui.releaseFunctionKey(index)}/>
    )
    return (
        <div className={className} style={style}>
            {key(FunctionKeyIndex.Clear)}
            {key(FunctionKeyIndex.Scale)}
            <span>CLEAR</span>
            <span>SCALE</span>
            {key(FunctionKeyIndex.Shuffle)}
            {key(FunctionKeyIndex.Double)}
            <span>SHUFFLE</span>
            <span>DOUBLE</span>
            {key(FunctionKeyIndex.Copy)}
            {key(FunctionKeyIndex.Paste)}
            <span>COPY</span>
            <span>PASTE</span>
        </div>
    )
}
