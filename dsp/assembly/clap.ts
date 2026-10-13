// CLAP ABI for wasm32: struct offsets, event types, flags, and small memory helpers.
// Offsets follow the CLAP 1.2 headers compiled for wasm32 (pointers and size_t are 4 bytes).

export namespace Entry {
    export const INIT: u32 = 12
    export const DEINIT: u32 = 16
    export const GET_FACTORY: u32 = 20
    export const SIZE: u32 = 24
}

export namespace Host {
    export const GET_EXTENSION: u32 = 32
    export const REQUEST_RESTART: u32 = 36
    export const REQUEST_PROCESS: u32 = 40
    export const REQUEST_CALLBACK: u32 = 44
}

export namespace Process {
    export const STEADY_TIME: u32 = 0
    export const FRAMES_COUNT: u32 = 8
    export const TRANSPORT: u32 = 12
    export const AUDIO_INPUTS: u32 = 16
    export const AUDIO_OUTPUTS: u32 = 20
    export const AUDIO_INPUTS_COUNT: u32 = 24
    export const AUDIO_OUTPUTS_COUNT: u32 = 28
    export const IN_EVENTS: u32 = 32
    export const OUT_EVENTS: u32 = 36
}

export namespace AudioBuffer {
    export const DATA32: u32 = 0
    export const CHANNEL_COUNT: u32 = 8
}

export namespace EventType {
    export const NOTE_ON: u16 = 0
    export const NOTE_OFF: u16 = 1
    export const PARAM_VALUE: u16 = 5
    export const PARAM_GESTURE_BEGIN: u16 = 7
    export const PARAM_GESTURE_END: u16 = 8
    export const TRANSPORT: u16 = 9
    export const MIDI: u16 = 10
}

export namespace Event {
    export const SIZE: u32 = 0
    export const TIME: u32 = 4
    export const SPACE_ID: u32 = 8
    export const TYPE: u32 = 10
    export const FLAGS: u32 = 12
    // clap_event_note
    export const NOTE_KEY: u32 = 24
    export const NOTE_VELOCITY: u32 = 32
    // clap_event_param_value, clap_event_param_gesture
    export const PARAM_ID: u32 = 16
    export const PARAM_VALUE: u32 = 40
    export const PARAM_VALUE_SIZE: u32 = 48
    export const PARAM_GESTURE_SIZE: u32 = 20
    // clap_event_midi
    export const MIDI_DATA: u32 = 18
}

export namespace Transport {
    export const FLAGS: u32 = 16
    export const SONG_POS_BEATS: u32 = 24
    export const TEMPO: u32 = 40
    export const HAS_TEMPO: u32 = 1 << 0
    export const HAS_BEATS_TIMELINE: u32 = 1 << 1
    export const HAS_TIME_SIGNATURE: u32 = 1 << 3
    export const IS_PLAYING: u32 = 1 << 4
    export const BEATTIME_FACTOR: f64 = 2147483648.0
}

export namespace ParamInfo {
    export const ID: u32 = 0
    export const FLAGS: u32 = 4
    export const COOKIE: u32 = 8
    export const NAME: u32 = 12
    export const MODULE: u32 = 268
    export const MIN: u32 = 1296
    export const MAX: u32 = 1304
    export const DEFAULT: u32 = 1312
    export const NAME_SIZE: u32 = 256
    export const MODULE_SIZE: u32 = 1024
    export const IS_AUTOMATABLE: u32 = 1 << 5
}

export namespace AudioPortInfo {
    export const ID: u32 = 0
    export const NAME: u32 = 4
    export const FLAGS: u32 = 260
    export const CHANNEL_COUNT: u32 = 264
    export const PORT_TYPE: u32 = 268
    export const IN_PLACE_PAIR: u32 = 272
    export const IS_MAIN: u32 = 1
}

export namespace NotePortInfo {
    export const ID: u32 = 0
    export const SUPPORTED_DIALECTS: u32 = 4
    export const PREFERRED_DIALECT: u32 = 8
    export const NAME: u32 = 12
    export const DIALECT_CLAP: u32 = 1
    export const DIALECT_MIDI: u32 = 2
}

export const CLAP_INVALID_ID: u32 = 0xffffffff

// A null-terminated UTF-8 copy that lives as long as the module (the stub runtime never frees)
export function cstring(text: string): usize {
    return changetype<usize>(String.UTF8.encode(text, true))
}

export function cstringEquals(ptr: usize, text: string): bool {
    if (ptr == 0) return false
    const length = text.length
    for (let i = 0; i < length; i++) {
        if (load<u8>(ptr + i) != <u8>text.charCodeAt(i)) return false
    }
    return load<u8>(ptr + length) == 0
}

// Copies ASCII text into a fixed-size char buffer, always terminated
export function writeText(ptr: usize, capacity: u32, text: string): u32 {
    if (capacity == 0) return 0
    const n = min<u32>(<u32>text.length, capacity - 1)
    for (let i: u32 = 0; i < n; i++) store<u8>(ptr + i, <u8>text.charCodeAt(i))
    store<u8>(ptr + n, 0)
    return n
}

// Calls a function pointer stored at ptr + offset
@inline export function fnAt(ptr: usize, offset: u32): u32 { return load<u32>(ptr + offset) }
