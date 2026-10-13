// Messages between the webview page and the plugin, mirrored in src/plugin/protocol.ts.
// Binary frames, little endian: u8 type, u8 flags, u16 reserved, then the payload.

export namespace Frame {
    export const HELLO: u8 = 1     // page → plugin  u32 version
    export const SNAPSHOT: u8 = 2  // plugin → page  u32 count, f64 values[count], u8 playing, u8 queued, i8 step, u8 0, patterns
    export const PARAM: u8 = 3     // both           u32 id, u32 0, f64 unit value
    export const GESTURE: u8 = 4   // page → plugin  u32 id, u8 begin
    export const PATTERN: u8 = 5   // page → plugin  u8 index, u8 0[3], pattern bytes
    export const SELECT: u8 = 6    // page → plugin  u8 index
    export const POSITION: u8 = 7  // plugin → page  u8 playing, u8 queued (255: none), i8 step (-1: stopped)
}

export const PROTOCOL_VERSION: u32 = 1
export const NO_PATTERN: u8 = 255
