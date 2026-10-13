import css from "./HardButton.sass?inline"
import {Exec, isDefined, Lifecycle} from "@opendaw/lib-std"
import {Events, Html} from "@opendaw/lib-dom"
import {createElement} from "@opendaw/lib-jsx"
import {Key} from "@/control/keys"
import {LightClasses} from "./LightClasses"

const className = Html.adoptStyleSheet(css, "HardButton")

type Construct = {
    lifecycle: Lifecycle
    kind: "switch" | "trigger"
    bright?: boolean
    model?: Key
    onPress: (event: PointerEvent) => void
    onRelease?: Exec
    capture?: boolean
}

export const HardButton = ({lifecycle, kind, bright, model, onPress, onRelease, capture = true}: Construct) => {
    const button: HTMLButtonElement = (
        <button className={Html.buildClassList(className, kind, bright === true && "bright")}/>
    )
    lifecycle.ownAll(
        Events.subscribe(button, "pointerdown", (event: PointerEvent) => {
            if (capture) {button.setPointerCapture(event.pointerId)}
            onPress(event)
        }),
        Events.subscribe(button, "pointerup", () => onRelease?.()),
        Events.subscribe(button, "lostpointercapture", () => onRelease?.())
    )
    if (isDefined(model)) {
        lifecycle.own(model.catchupAndSubscribe(key => LightClasses.apply(button, key)))
    }
    return button
}
