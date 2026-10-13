import css from "./MainKeys.sass?inline"
import {Arrays, int, Lifecycle} from "@opendaw/lib-std"
import {Events, Html} from "@opendaw/lib-dom"
import {createElement} from "@opendaw/lib-jsx"
import {UIContext} from "@/control/context"
import {HardButton} from "./HardButton"
import {Labeled} from "./Labeled"

const className = Html.adoptStyleSheet(css, "MainKeys")

type Construct = {
    lifecycle: Lifecycle
    ui: UIContext
    style?: Partial<CSSStyleDeclaration>
}

// Pressing a step key and dragging over others paints them with the value the pressed key got
export const MainKeys = ({lifecycle, ui, style}: Construct) => {
    let painting: int = -1
    let last: int = -1
    const pairs = Arrays.create(pair => (
        <div className="two">
            {[pair * 2, pair * 2 + 1].map(index => {
                const button: HTMLElement = (
                    <HardButton lifecycle={lifecycle}
                                kind="switch"
                                capture={false}
                                model={ui.stepKeys.byIndex(index)}
                                onPress={event => {
                                    ui.pressStepKey(index, event.shiftKey)
                                    painting = index
                                    last = index
                                }}/>
                )
                button.dataset.step = String(index)
                return <Labeled label={String(index + 1)}>{button}</Labeled>
            })}
        </div>
    ), 8)
    const stepAt = (event: PointerEvent): int => {
        const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-step]")
        return element === null || element === undefined ? -1 : Number(element.dataset.step)
    }
    const end = () => {
        if (painting === -1) {return}
        ui.releaseStepKey(painting)
        painting = -1
        last = -1
    }
    lifecycle.ownAll(
        Events.subscribe(window, "pointermove", (event: PointerEvent) => {
            if (painting === -1) {return}
            const index = stepAt(event)
            if (index === -1 || index === last) {return}
            // fill the keys a fast move skipped
            const direction = Math.sign(index - last)
            for (let key = last + direction; key !== index + direction; key += direction) {ui.paintStepKey(key)}
            last = index
        }),
        Events.subscribe(window, "pointerup", end),
        Events.subscribe(window, "pointercancel", end)
    )
    return (
        <div className={className} style={style}>
            {pairs.flatMap((pair, index) => index === 0 ? [pair] : [<hr/>, pair])}
        </div>
    )
}
