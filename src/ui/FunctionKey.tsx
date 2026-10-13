import css from "./FunctionKey.sass?inline"
import {Exec, Lifecycle} from "@opendaw/lib-std"
import {Events, Html} from "@opendaw/lib-dom"
import {createElement} from "@opendaw/lib-jsx"
import {Key} from "@/control/keys"
import {LightClasses} from "./LightClasses"

const className = Html.adoptStyleSheet(css, "FunctionKey")

type Construct = {
    lifecycle: Lifecycle
    model: Key
    onPress: Exec
    onRelease?: Exec
    title?: string
}

export const FunctionKey = ({lifecycle, model, onPress, onRelease, title}: Construct) => {
    const button: HTMLButtonElement = <button className={className} title={title ?? ""}/>
    lifecycle.ownAll(
        model.catchupAndSubscribe(key => LightClasses.apply(button, key)),
        // the lamp lights while the key is down to confirm the click
        Events.subscribe(button, "pointerdown", (event: PointerEvent) => {
            button.setPointerCapture(event.pointerId)
            button.classList.add("down")
            onPress()
        }),
        Events.subscribe(button, "pointerup", () => {
            button.classList.remove("down")
            onRelease?.()
        }),
        Events.subscribe(button, "lostpointercapture", () => {
            button.classList.remove("down")
            onRelease?.()
        })
    )
    return button
}
