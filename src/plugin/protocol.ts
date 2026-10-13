import {int} from "@opendaw/lib-std"
import {NUM_PATTERNS, PatternLayout} from "@/audio/pattern"

// Messages between this page and the plugin (dsp/assembly/protocol.ts).
// Binary frames, little endian: u8 type, u8 flags, u16 reserved, then the payload.
export enum FrameType {
    Hello = 1,    // page → plugin  u32 version
    Snapshot = 2, // plugin → page  u32 count, f64 values[count], position (4 bytes), patterns
    Param = 3,    // both           u32 id, u32 0, f64 unit value
    Gesture = 4,  // page → plugin  u32 id, u8 begin
    Pattern = 5,  // page → plugin  u8 index, u8 0[3], pattern bytes
    Select = 6,   // page → plugin  u8 index
    Position = 7  // plugin → page  u8 playing, u8 queued (255: none), i8 step (-1: stopped)
}

export const ProtocolVersion = 1

export type Position = { playing: int, queued: int, step: int }

export type Snapshot = { values: ReadonlyArray<number>, position: Position, patterns: ReadonlyArray<Uint8Array> }

export type FromPlugin =
    | { type: "snapshot", snapshot: Snapshot }
    | { type: "param", id: int, value: number }
    | { type: "position", position: Position }

const frame = (type: FrameType, size: int): DataView<ArrayBuffer> => {
    const view = new DataView(new ArrayBuffer(size))
    view.setUint8(0, type)
    return view
}

const readPosition = (view: DataView, offset: int): Position => {
    const queued = view.getUint8(offset + 1)
    return {playing: view.getUint8(offset), queued: queued === 255 ? -1 : queued, step: view.getInt8(offset + 2)}
}

export namespace Frames {
    export const hello = (): ArrayBuffer => {
        const view = frame(FrameType.Hello, 8)
        view.setUint32(4, ProtocolVersion, true)
        return view.buffer
    }

    export const param = (id: int, value: number): ArrayBuffer => {
        const view = frame(FrameType.Param, 16)
        view.setUint32(4, id, true)
        view.setFloat64(8, value, true)
        return view.buffer
    }

    export const gesture = (id: int, begin: boolean): ArrayBuffer => {
        const view = frame(FrameType.Gesture, 12)
        view.setUint32(4, id, true)
        view.setUint8(8, begin ? 1 : 0)
        return view.buffer
    }

    export const pattern = (index: int, bytes: Uint8Array): ArrayBuffer => {
        const view = frame(FrameType.Pattern, 8 + PatternLayout.Size)
        view.setUint8(4, index)
        new Uint8Array(view.buffer).set(bytes, 8)
        return view.buffer
    }

    export const select = (index: int): ArrayBuffer => {
        const view = frame(FrameType.Select, 8)
        view.setUint8(4, index)
        return view.buffer
    }

    export const decode = (buffer: ArrayBuffer): FromPlugin | null => {
        if (buffer.byteLength < 4) {return null}
        const view = new DataView(buffer)
        switch (view.getUint8(0)) {
            case FrameType.Snapshot: {
                const count = view.getUint32(4, true)
                const values = Array.from({length: count}, (_, index) => view.getFloat64(8 + index * 8, true))
                const offset = 8 + count * 8
                const patterns = Array.from({length: NUM_PATTERNS}, (_, index) =>
                    new Uint8Array(buffer, offset + 4 + index * PatternLayout.Size, PatternLayout.Size))
                return {type: "snapshot", snapshot: {values, position: readPosition(view, offset), patterns}}
            }
            case FrameType.Param:
                return {type: "param", id: view.getUint32(4, true), value: view.getFloat64(8, true)}
            case FrameType.Position:
                return {type: "position", position: readPosition(view, 4)}
            default:
                return null
        }
    }
}
