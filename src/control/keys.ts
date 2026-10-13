import {int, Notifier, Observer, Subscription} from "@opendaw/lib-std"

export enum FunctionKeyIndex {Scale, Clear}

export enum KeyState {Off, Flash, Blink, On}

export type KeyLight = "off" | "on" | "blink" | "flash"

export class Key {
    readonly #notifier: Notifier<Key> = new Notifier<Key>()

    #state: KeyState = KeyState.Off
    #pressed: boolean = false
    #running: boolean = false

    constructor(readonly keyIndex: int) {}

    get state(): KeyState {return this.#state}
    get pressed(): boolean {return this.#pressed}

    setState(state: KeyState): void {
        if (this.#state === state) {return}
        this.#state = state
        this.#notifier.notify(this)
    }

    setPressed(value: boolean): void {
        if (this.#pressed === value) {return}
        this.#pressed = value
        this.#notifier.notify(this)
    }

    setRunning(value: boolean): void {
        if (this.#running === value) {return}
        this.#running = value
        this.#notifier.notify(this)
    }

    // the running step indicator inverts the lamp like the original hardware
    light(): KeyLight {
        if (this.#running) {return this.#state === KeyState.Flash ? "blink" : "flash"}
        switch (this.#state) {
            case KeyState.Off:
                return "off"
            case KeyState.On:
                return "on"
            case KeyState.Blink:
                return "blink"
            case KeyState.Flash:
                return "flash"
        }
    }

    subscribe(observer: Observer<Key>): Subscription {return this.#notifier.subscribe(observer)}

    catchupAndSubscribe(observer: Observer<Key>): Subscription {
        observer(this)
        return this.#notifier.subscribe(observer)
    }
}

export class KeyGroup {
    readonly keys: ReadonlyArray<Key>

    constructor(count: int) {this.keys = Array.from({length: count}, (_, index) => new Key(index))}

    byIndex(index: int): Key {return this.keys[index]}

    forEach(procedure: (key: Key, index: int) => void): void {this.keys.forEach(procedure)}

    activate(map: (index: int) => KeyState): void {this.keys.forEach((key, index) => key.setState(map(index)))}
}
