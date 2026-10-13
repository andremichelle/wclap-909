import "./style.sass"
import {Terminator} from "@opendaw/lib-std"
import {AnimationFrame, Events} from "@opendaw/lib-dom"
import {createElement, replaceChildren} from "@opendaw/lib-jsx"
import {UIContext} from "@/control/context"
import {Connection} from "@/plugin/connection"
import {App} from "@/ui/App"

// The plugin's webview page. It runs in the host's plugin window and talks to the plugin through the host.
const lifecycle = new Terminator()
const connection = lifecycle.own(new Connection())
AnimationFrame.start(window)
const ui = lifecycle.own(new UIContext(connection))
lifecycle.ownAll(
    Events.subscribe(document, "touchmove", event => event.preventDefault(), {passive: false}),
    Events.subscribe(document, "dblclick", event => event.preventDefault(), {passive: false}),
    Events.subscribe(document, "contextmenu", event => event.preventDefault())
)
replaceChildren(document.body, <App lifecycle={lifecycle} ui={ui}/>)
