import {Notifier, Observer, Subscription, Terminable} from "@opendaw/lib-std"
import {Events} from "@opendaw/lib-dom"
import {Frames, FromPlugin} from "./protocol"

// The WebCLAP webview channel: frames go to the host with window.parent.postMessage, the host relays them to
// the plugin's clap.webview receive(). The plugin's host.send() arrives as message events.
export class Connection implements Terminable {
    readonly #notifier: Notifier<FromPlugin> = new Notifier<FromPlugin>()
    readonly #subscription: Subscription

    constructor(readonly target: Window = window.parent) {
        this.#subscription = Events.subscribe(window, "message", (event: MessageEvent) => {
            const data = event.data
            const buffer = data instanceof ArrayBuffer ? data
                : ArrayBuffer.isView(data) ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
                    : null
            if (buffer === null) {return}
            const message = Frames.decode(buffer)
            if (message !== null) {this.#notifier.notify(message)}
        })
    }

    subscribe(observer: Observer<FromPlugin>): Subscription {return this.#notifier.subscribe(observer)}

    send(buffer: ArrayBuffer): void {this.target.postMessage(buffer, "*", [buffer])}

    terminate(): void {
        this.#subscription.terminate()
        this.#notifier.terminate()
    }
}
