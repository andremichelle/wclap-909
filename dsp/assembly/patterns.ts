// Eight patterns as plain bytes, in the layout the page sends (src/audio/pattern.ts):
// steps[channel * 64 + step], totalAccents[64], lastStep (1...64), scaleIndex, shuffleIndex, flamIndex

export namespace Channel {
    export const Bassdrum: i32 = 0
    export const Snaredrum: i32 = 1
    export const TomLow: i32 = 2
    export const TomMid: i32 = 3
    export const TomHi: i32 = 4
    export const Rim: i32 = 5
    export const Clap: i32 = 6
    export const Hihat: i32 = 7
    export const Crash: i32 = 8
    export const Ride: i32 = 9
    export const Count: i32 = 10
}

// Weak is a normal step, Full an accented one. 'Extra' is 'Flam' for bassdrum, snaredrum and toms or 'Open'
// for hihat, ExtraAccent the same accented.
export namespace Step {
    export const None: u8 = 0
    export const Weak: u8 = 1
    export const Full: u8 = 2
    export const Extra: u8 = 3
    export const ExtraAccent: u8 = 4

    @inline export function isAccent(step: u8): bool {return step == Full || step == ExtraAccent}

    @inline export function isExtra(step: u8): bool {return step == Extra || step == ExtraAccent}
}

export const NUM_PATTERNS: i32 = 8
export const NUM_STEPS: i32 = 64

export namespace Layout {
    export const STEPS: i32 = 0
    export const ACCENTS: i32 = Channel.Count * NUM_STEPS
    export const LAST_STEP: i32 = ACCENTS + NUM_STEPS
    export const SCALE: i32 = LAST_STEP + 1
    export const SHUFFLE: i32 = LAST_STEP + 2
    export const FLAM: i32 = LAST_STEP + 3
    export const SIZE: i32 = LAST_STEP + 4
}

const SCALE_RATIOS: StaticArray<f64> = [3.0 / 16.0, 3.0 / 32.0, 1.0 / 32.0, 1.0 / 16.0]

export class Pattern {
    readonly bytes: StaticArray<u8> = new StaticArray<u8>(Layout.SIZE)

    private shuffleEnabled: bool = false
    private shuffleExponent: f64 = 1.0
    private shuffleDuration: f64 = 1.0 / 8.0

    constructor() {this.clear()}

    clear(): void {
        for (let i = 0; i < Layout.SIZE; i++) unchecked(this.bytes[i] = 0)
        unchecked(this.bytes[Layout.LAST_STEP] = 16)
        unchecked(this.bytes[Layout.SCALE] = 3)
        this.update()
    }

    // Takes a pattern sent by the page or read from state, rejecting values out of range
    read(ptr: usize): void {
        for (let i = 0; i < Layout.SIZE; i++) unchecked(this.bytes[i] = load<u8>(ptr + i))
        for (let i = 0; i < Layout.ACCENTS; i++) if (unchecked(this.bytes[i]) > Step.ExtraAccent) unchecked(this.bytes[i] = Step.None)
        const lastStep = unchecked(this.bytes[Layout.LAST_STEP])
        if (lastStep < 1 || <i32>lastStep > NUM_STEPS) unchecked(this.bytes[Layout.LAST_STEP] = 16)
        if (unchecked(this.bytes[Layout.SCALE]) > 3) unchecked(this.bytes[Layout.SCALE] = 3)
        if (unchecked(this.bytes[Layout.SHUFFLE]) > 6) unchecked(this.bytes[Layout.SHUFFLE] = 0)
        if (unchecked(this.bytes[Layout.FLAM]) > 7) unchecked(this.bytes[Layout.FLAM] = 0)
        this.update()
    }

    write(ptr: usize): void {
        for (let i = 0; i < Layout.SIZE; i++) store<u8>(ptr + i, unchecked(this.bytes[i]))
    }

    @inline step(channel: i32, index: i32): u8 { return unchecked(this.bytes[Layout.STEPS + channel * NUM_STEPS + index]) }

    @inline isTotalAccent(index: i32): bool { return unchecked(this.bytes[Layout.ACCENTS + index]) != 0 }

    @inline lastStep(): i32 { return unchecked(this.bytes[Layout.LAST_STEP]) }

    @inline scaleRatio(): f64 { return unchecked(SCALE_RATIOS[this.bytes[Layout.SCALE]]) }

    @inline duration(): f64 { return <f64>this.lastStep() * this.scaleRatio() }

    // milliseconds
    @inline flamDelay(): f64 { return 10.0 + <f64>unchecked(this.bytes[Layout.FLAM]) * 4.0 }

    shuffleInverse(position: f64): f64 {
        return this.shuffleEnabled ? this.mapShuffle(position, this.shuffleExponent) : position
    }

    shuffleTransform(position: f64): f64 {
        return this.shuffleEnabled ? this.mapShuffle(position, 1.0 / this.shuffleExponent) : position
    }

    // we divide by 32 instead of multiplying by 2/96 (too little shuffle by ear)
    private update(): void {
        const scale = unchecked(this.bytes[Layout.SCALE])
        const exponent = Math.log(0.5) / Math.log(0.5 + <f64>unchecked(this.bytes[Layout.SHUFFLE]) / 32.0)
        if (scale == 2) {
            this.shuffleEnabled = true
            this.shuffleExponent = exponent
            this.shuffleDuration = 1.0 / 16.0
        } else if (scale == 3) {
            this.shuffleEnabled = true
            this.shuffleExponent = exponent
            this.shuffleDuration = 1.0 / 8.0
        } else {
            this.shuffleEnabled = false
            this.shuffleExponent = 1.0
            this.shuffleDuration = 1.0 / 8.0
        }
    }

    private mapShuffle(position: f64, exponent: f64): f64 {
        const duration = this.shuffleDuration
        const start = Math.floor(position / duration) * duration
        const normalized = (position - start) / duration
        return start + Math.pow(normalized, exponent) * duration
    }
}
