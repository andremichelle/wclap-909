import css from "./App.sass?inline"
import {Lifecycle} from "@opendaw/lib-std"
import {Html} from "@opendaw/lib-dom"
import {createElement} from "@opendaw/lib-jsx"
import {UIContext} from "@/control/context"
import {TR909} from "./TR909"

const className = Html.adoptStyleSheet(css, "App")

const SurfaceSize = {width: 1164, height: 598}

type Construct = {
    lifecycle: Lifecycle
    ui: UIContext
}

// Scales the panel to the plugin window
export const App = ({lifecycle, ui}: Construct) => {
    const surface: HTMLElement = <TR909 lifecycle={lifecycle} ui={ui}/>
    const main: HTMLElement = <main className={className}>{surface}</main>
    lifecycle.own(Html.watchResize(main, () => {
        const scale = Math.min(main.clientWidth / SurfaceSize.width, main.clientHeight / SurfaceSize.height)
        surface.style.setProperty("--scale", `${scale}`)
    }))
    return main
}
