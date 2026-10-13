import {clamp, DefaultParameter, StringMapping, Terminable, Terminator, unitValue, ValueMapping} from "@opendaw/lib-std"

export type BassdrumPreset = {
    tune: DefaultParameter<number>
    level: DefaultParameter<number>
    attack: DefaultParameter<number>
    decay: DefaultParameter<number>
}

export type SnaredrumPreset = {
    tune: DefaultParameter<number>
    level: DefaultParameter<number>
    tone: DefaultParameter<number>
    snappy: DefaultParameter<number>
}

export type TomPreset = {
    tune: DefaultParameter<number>
    level: DefaultParameter<number>
    decay: DefaultParameter<number>
}

export type RimOrClapPreset = {
    level: DefaultParameter<number>
}

export type HihatPreset = {
    level: DefaultParameter<number>
    decay: DefaultParameter<number>
}

export type CrashOrRidePreset = {
    level: DefaultParameter<number>
    tune: DefaultParameter<number>
}

export type BasicVoicePreset = {
    level: DefaultParameter<number>
    tune?: DefaultParameter<number>
    decay?: DefaultParameter<number>
}

const BassdrumTuneMapping = ValueMapping.exponential(0.007, 0.0294)
const BassdrumDecayMapping = ValueMapping.exponential(0.012, 0.100)
const TomDecayMapping = ValueMapping.exponential(0.04, 0.15)
const SnaredrumDecayMapping = ValueMapping.exponential(0.04, 0.2)
const OpenedHihatMapping = ValueMapping.exponential(0.03, 0.16)
const ClosedHihatMapping = ValueMapping.exponential(0.008, 0.06)
const TuneMapping = ValueMapping.linear(-0.5, 0.5)
const LevelMapping = ValueMapping.DefaultDecibel

const TimeString = StringMapping.numeric({unit: "s", fractionDigits: 3})
const TuneString = StringMapping.numeric({unit: "oct", fractionDigits: 2, bipolar: true})

const level = (name: string, value: number) => new DefaultParameter<number>(LevelMapping, StringMapping.decible, name, value)
const tune = (name: string) => new DefaultParameter<number>(TuneMapping, TuneString, name, 0.0)
const time = (name: string, mapping: ValueMapping<number>, unit: unitValue) =>
    new DefaultParameter<number>(mapping, TimeString, name, mapping.y(clamp(unit, 0.0, 1.0)))

export class Preset implements Terminable {
    readonly #terminator: Terminator = new Terminator()
    readonly #parameters: Array<DefaultParameter<number>> = []

    readonly volume: DefaultParameter<number>
    readonly accent: DefaultParameter<number>
    readonly bassdrum: Readonly<BassdrumPreset>
    readonly snaredrum: Readonly<SnaredrumPreset>
    readonly tomLow: Readonly<TomPreset>
    readonly tomMid: Readonly<TomPreset>
    readonly tomHi: Readonly<TomPreset>
    readonly rim: Readonly<RimOrClapPreset>
    readonly clap: Readonly<RimOrClapPreset>
    readonly hihatLevel: DefaultParameter<number>
    readonly closedHihat: Readonly<HihatPreset>
    readonly openedHihat: Readonly<HihatPreset>
    readonly crash: Readonly<CrashOrRidePreset>
    readonly ride: Readonly<CrashOrRidePreset>

    constructor() {
        this.volume = this.#register(level("Volume", 0.0))
        this.accent = this.#register(new DefaultParameter<number>(ValueMapping.unipolar(), StringMapping.percent(), "Total Accent", 0.5))
        this.bassdrum = {
            tune: this.#register(time("BD Tune", BassdrumTuneMapping, 0.0)),
            level: this.#register(level("BD Level", -6.0)),
            attack: this.#register(level("BD Attack", 0.0)),
            decay: this.#register(time("BD Decay", BassdrumDecayMapping, 0.5))
        }
        this.snaredrum = {
            tune: this.#register(tune("SD Tune")),
            level: this.#register(level("SD Level", -6.0)),
            tone: this.#register(time("SD Tone", SnaredrumDecayMapping, 1.0)),
            snappy: this.#register(level("SD Snappy", 0.0))
        }
        this.tomLow = this.#createTom("LT")
        this.tomMid = this.#createTom("MT")
        this.tomHi = this.#createTom("HT")
        this.rim = {level: this.#register(level("RS Level", -6.0))}
        this.clap = {level: this.#register(level("HC Level", -6.0))}
        this.hihatLevel = this.#register(level("HH Level", -6.0))
        this.closedHihat = {
            level: this.hihatLevel,
            decay: this.#register(time("CH Decay", ClosedHihatMapping, 0.0))
        }
        this.openedHihat = {
            level: this.hihatLevel,
            decay: this.#register(time("OH Decay", OpenedHihatMapping, 0.5))
        }
        this.crash = {
            level: this.#register(level("Crash Level", -6.0)),
            tune: this.#register(tune("Crash Tune"))
        }
        this.ride = {
            level: this.#register(level("Ride Level", -6.0)),
            tune: this.#register(tune("Ride Tune"))
        }
    }

    // In registration order, which is the order of the plugin's CLAP parameter ids (dsp/assembly/params.ts)
    parameters(): ReadonlyArray<DefaultParameter<number>> {return this.#parameters}

    terminate(): void {this.#terminator.terminate()}

    #createTom(prefix: string): TomPreset {
        return {
            tune: this.#register(tune(`${prefix} Tune`)),
            level: this.#register(level(`${prefix} Level`, -6.0)),
            decay: this.#register(time(`${prefix} Decay`, TomDecayMapping, 1.0))
        }
    }

    #register(parameter: DefaultParameter<number>): DefaultParameter<number> {
        this.#parameters.push(parameter)
        return this.#terminator.own(parameter)
    }
}
