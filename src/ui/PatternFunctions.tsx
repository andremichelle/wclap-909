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
    [FunctionKeyIndex.Scale]: "Cycles the scale of the pattern",
    [FunctionKeyIndex.Clear]: "Clears the selected instrument in the pattern"
}

export const PatternFunctions = ({lifecycle, ui, style}: Construct) => {
    const key = (index: FunctionKeyIndex) => (
        <FunctionKey lifecycle={lifecycle} model={ui.functionKeys.byIndex(index)} title={Titles[index]}
                     onPress={() => ui.pressFunctionKey(index)}
                     onRelease={() => ui.releaseFunctionKey(index)}/>
    )
    return (
        <div className={className} style={style}>
            {key(FunctionKeyIndex.Scale)}
            {key(FunctionKeyIndex.Clear)}
            <span>SCALE</span>
            <span>CLEAR</span>
        </div>
    )
}
