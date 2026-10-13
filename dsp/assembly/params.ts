// The parameters. The CLAP value of every parameter is its unit value (0...1), the mappings below turn it
// into dB, seconds or octaves. They match the mappings in src/audio/preset.ts.

export enum Mapping {Level, Exponential, Linear, Unipolar}

export enum Unit {Decibel, Seconds, Octaves, Percent}

export class ParamDef {
    constructor(readonly id: u32,
                readonly name: string,
                readonly module: string,
                readonly mapping: Mapping,
                readonly min: f64,
                readonly max: f64,
                readonly unit: Unit,
                readonly defaultUnit: f64) {}
}

export namespace ParamId {
    export const Volume: u32 = 0
    export const Accent: u32 = 1
    export const BassdrumTune: u32 = 2
    export const BassdrumLevel: u32 = 3
    export const BassdrumAttack: u32 = 4
    export const BassdrumDecay: u32 = 5
    export const SnaredrumTune: u32 = 6
    export const SnaredrumLevel: u32 = 7
    export const SnaredrumTone: u32 = 8
    export const SnaredrumSnappy: u32 = 9
    export const TomLowTune: u32 = 10
    export const TomLowLevel: u32 = 11
    export const TomLowDecay: u32 = 12
    export const TomMidTune: u32 = 13
    export const TomMidLevel: u32 = 14
    export const TomMidDecay: u32 = 15
    export const TomHiTune: u32 = 16
    export const TomHiLevel: u32 = 17
    export const TomHiDecay: u32 = 18
    export const RimLevel: u32 = 19
    export const ClapLevel: u32 = 20
    export const HihatLevel: u32 = 21
    export const ClosedHihatDecay: u32 = 22
    export const OpenedHihatDecay: u32 = 23
    export const CrashLevel: u32 = 24
    export const CrashTune: u32 = 25
    export const RideLevel: u32 = 26
    export const RideTune: u32 = 27
    export const Count: u32 = 28
}

// ValueMapping.DefaultDecibel: decibel(-72, -12, 0)
const DB_MIN: f64 = -72.0
const DB_MID: f64 = -12.0
const DB_MAX: f64 = 0.0
const DB_A: f64 = ((2.0 * DB_MAX - DB_MID) * DB_MIN - DB_MID * DB_MAX) / (DB_MIN + DB_MAX - 2.0 * DB_MID)
const DB_B: f64 = ((DB_MAX - DB_MID) * DB_MIN * DB_MIN + (DB_MID * DB_MID - DB_MAX * DB_MAX) * DB_MIN
    + DB_MID * DB_MAX * DB_MAX - DB_MID * DB_MID * DB_MAX)
    / (DB_MIN * DB_MIN + (2.0 * DB_MAX - 4.0 * DB_MID) * DB_MIN + DB_MAX * DB_MAX - 4.0 * DB_MID * DB_MAX + 4.0 * DB_MID * DB_MID)
const DB_C: f64 = -(DB_MAX - DB_MID) / (DB_MIN + DB_MAX - 2.0 * DB_MID)

function decibelY(x: f64): f64 {
    if (x <= 0.0) return -Infinity
    if (x >= 1.0) return DB_MAX
    return DB_A - DB_B / (x + DB_C)
}

function decibelX(y: f64): f64 {
    if (y <= DB_MIN) return 0.0
    if (y >= DB_MAX) return 1.0
    return -DB_B / (y - DB_A) - DB_C
}

function exponentialX(min: f64, max: f64, y: f64): f64 {
    return y <= min ? 0.0 : y >= max ? 1.0 : Math.log(y / min) / Math.log(max / min)
}

function level(id: u32, name: string, module: string, db: f64): ParamDef {
    return new ParamDef(id, name, module, Mapping.Level, DB_MIN, DB_MAX, Unit.Decibel, decibelX(db))
}

function tune(id: u32, name: string, module: string): ParamDef {
    return new ParamDef(id, name, module, Mapping.Linear, -0.5, 0.5, Unit.Octaves, 0.5)
}

function time(id: u32, name: string, module: string, min: f64, max: f64, unit: f64): ParamDef {
    return new ParamDef(id, name, module, Mapping.Exponential, min, max, Unit.Seconds, unit)
}

export const PARAMS: StaticArray<ParamDef> = [
    level(ParamId.Volume, "Volume", "Master", 0.0),
    new ParamDef(ParamId.Accent, "Total Accent", "Master", Mapping.Unipolar, 0.0, 1.0, Unit.Percent, 0.5),
    time(ParamId.BassdrumTune, "BD Tune", "Bass Drum", 0.007, 0.0294, 0.0),
    level(ParamId.BassdrumLevel, "BD Level", "Bass Drum", -6.0),
    level(ParamId.BassdrumAttack, "BD Attack", "Bass Drum", 0.0),
    time(ParamId.BassdrumDecay, "BD Decay", "Bass Drum", 0.012, 0.100, 0.5),
    tune(ParamId.SnaredrumTune, "SD Tune", "Snare Drum"),
    level(ParamId.SnaredrumLevel, "SD Level", "Snare Drum", -6.0),
    time(ParamId.SnaredrumTone, "SD Tone", "Snare Drum", 0.04, 0.2, 1.0),
    level(ParamId.SnaredrumSnappy, "SD Snappy", "Snare Drum", 0.0),
    tune(ParamId.TomLowTune, "LT Tune", "Low Tom"),
    level(ParamId.TomLowLevel, "LT Level", "Low Tom", -6.0),
    time(ParamId.TomLowDecay, "LT Decay", "Low Tom", 0.04, 0.15, 1.0),
    tune(ParamId.TomMidTune, "MT Tune", "Mid Tom"),
    level(ParamId.TomMidLevel, "MT Level", "Mid Tom", -6.0),
    time(ParamId.TomMidDecay, "MT Decay", "Mid Tom", 0.04, 0.15, 1.0),
    tune(ParamId.TomHiTune, "HT Tune", "Hi Tom"),
    level(ParamId.TomHiLevel, "HT Level", "Hi Tom", -6.0),
    time(ParamId.TomHiDecay, "HT Decay", "Hi Tom", 0.04, 0.15, 1.0),
    level(ParamId.RimLevel, "RS Level", "Rim Shot", -6.0),
    level(ParamId.ClapLevel, "HC Level", "Hand Clap", -6.0),
    level(ParamId.HihatLevel, "HH Level", "Hi Hat", -6.0),
    time(ParamId.ClosedHihatDecay, "CH Decay", "Hi Hat", 0.008, 0.06, 0.0),
    time(ParamId.OpenedHihatDecay, "OH Decay", "Hi Hat", 0.03, 0.16, 0.5),
    level(ParamId.CrashLevel, "Crash Level", "Cymbal", -6.0),
    tune(ParamId.CrashTune, "Crash Tune", "Cymbal"),
    level(ParamId.RideLevel, "Ride Level", "Cymbal", -6.0),
    tune(ParamId.RideTune, "Ride Tune", "Cymbal")
]

export function plainValue(def: ParamDef, x: f64): f64 {
    switch (def.mapping) {
        case Mapping.Level:
            return decibelY(x)
        case Mapping.Exponential:
            return x <= 0.0 ? def.min : x >= 1.0 ? def.max : Math.exp(x * Math.log(def.max / def.min)) * def.min
        case Mapping.Linear:
            return x <= 0.0 ? def.min : x >= 1.0 ? def.max : def.min + x * (def.max - def.min)
        default:
            return x < 0.0 ? 0.0 : x > 1.0 ? 1.0 : x
    }
}

export function unitValue(def: ParamDef, y: f64): f64 {
    switch (def.mapping) {
        case Mapping.Level:
            return decibelX(y)
        case Mapping.Exponential:
            return exponentialX(def.min, def.max, y)
        case Mapping.Linear:
            return y <= def.min ? 0.0 : y >= def.max ? 1.0 : (y - def.min) / (def.max - def.min)
        default:
            return y < 0.0 ? 0.0 : y > 1.0 ? 1.0 : y
    }
}

export class Params {
    readonly units: StaticArray<f64> = new StaticArray<f64>(ParamId.Count)
    readonly plains: StaticArray<f64> = new StaticArray<f64>(ParamId.Count)

    constructor() {
        for (let i: u32 = 0; i < ParamId.Count; i++) this.set(i, PARAMS[i].defaultUnit)
    }

    set(id: u32, unit: f64): void {
        const clamped = unit < 0.0 ? 0.0 : unit > 1.0 ? 1.0 : unit
        unchecked(this.units[id] = clamped)
        unchecked(this.plains[id] = plainValue(PARAMS[id], clamped))
    }

    @inline unit(id: u32): f64 { return unchecked(this.units[id]) }

    @inline plain(id: u32): f64 { return unchecked(this.plains[id]) }
}

// ---------------------------------------------------------------------------------------------------------------
// Text without allocations: value_to_text is called often (host sliders), and the stub runtime never frees.

class TextWriter {
    ptr: usize = 0
    capacity: u32 = 0
    length: u32 = 0

    reset(ptr: usize, capacity: u32): void {
        this.ptr = ptr
        this.capacity = capacity
        this.length = 0
    }

    char(c: i32): void {
        if (this.length + 1 >= this.capacity) return
        store<u8>(this.ptr + this.length, <u8>c)
        this.length++
    }

    text(s: string): void {
        for (let i = 0; i < s.length; i++) this.char(s.charCodeAt(i))
    }

    fixed(value: f64, digits: i32, sign: bool): void {
        if (isNaN(value)) {
            this.text("NaN")
            return
        }
        if (!isFinite(value)) {
            this.text(value < 0.0 ? "-inf" : "inf")
            return
        }
        let scale: f64 = 1.0
        for (let i = 0; i < digits; i++) scale *= 10.0
        let scaled = Math.round(Math.abs(value) * scale)
        if (value < 0.0 && scaled > 0.0) this.char(45)
        else if (sign) this.char(43)
        const integer = <u64>Math.floor(scaled / scale)
        const fraction = <u64>(scaled - <f64>integer * scale)
        this.unsigned(integer, 1)
        if (digits > 0) {
            this.char(46)
            this.unsigned(fraction, digits)
        }
    }

    // digits are collected backwards in SCRATCH, then written in order
    unsigned(value: u64, minDigits: i32): void {
        let count = 0
        let rest = value
        do {
            store<u8>(SCRATCH + count, <u8>(48 + rest % 10))
            rest /= 10
            count++
        } while (rest > 0 && count < 20)
        while (count < minDigits && count < 20) store<u8>(SCRATCH + count++, 48)
        for (let i = count - 1; i >= 0; i--) this.char(load<u8>(SCRATCH + i))
    }
}

const SCRATCH: usize = memory.data(32)
const writer = new TextWriter()

export function formatValue(id: u32, unit: f64, ptr: usize, capacity: u32): bool {
    if (id >= ParamId.Count || capacity == 0) return false
    const def = PARAMS[id]
    const y = plainValue(def, unit)
    writer.reset(ptr, capacity)
    switch (def.unit) {
        case Unit.Decibel:
            writer.fixed(y, 2, false)
            writer.text(" db")
            break
        case Unit.Seconds:
            writer.fixed(y, 3, false)
            writer.text(" s")
            break
        case Unit.Octaves:
            writer.fixed(y, 2, true)
            writer.text(" oct")
            break
        default:
            writer.fixed(y * 100.0, 0, false)
            writer.text(" %")
    }
    store<u8>(ptr + writer.length, 0)
    return true
}

// Parses the number at the start of the text (as typed in a host's value field) in the parameter's display unit
export function parseValue(id: u32, ptr: usize): f64 {
    if (id >= ParamId.Count || ptr == 0) return NaN
    let i: usize = 0
    while (load<u8>(ptr + i) == 32) i++
    let negative = false
    const first = load<u8>(ptr + i)
    if (first == 45 || first == 43) {
        negative = first == 45
        i++
    }
    let value: f64 = 0.0
    let digits = 0
    while (true) {
        const c = load<u8>(ptr + i)
        if (c < 48 || c > 57) break
        value = value * 10.0 + <f64>(c - 48)
        digits++
        i++
    }
    if (load<u8>(ptr + i) == 46) {
        i++
        let scale: f64 = 0.1
        while (true) {
            const c = load<u8>(ptr + i)
            if (c < 48 || c > 57) break
            value += <f64>(c - 48) * scale
            scale *= 0.1
            digits++
            i++
        }
    }
    if (digits == 0) return NaN
    if (negative) value = -value
    const def = PARAMS[id]
    return unitValue(def, def.unit == Unit.Percent ? value / 100.0 : value)
}
