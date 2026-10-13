import css from "./Instruments.sass?inline"
import {DefaultParameter, int, Lifecycle} from "@opendaw/lib-std"
import {Html} from "@opendaw/lib-dom"
import {createElement, JsxValue} from "@opendaw/lib-jsx"
import {UIContext} from "@/control/context"
import {Instrument} from "@/control/instrument"
import {FunctionKey} from "./FunctionKey"
import {Knob} from "./Knob"

const className = Html.adoptStyleSheet(css, "Instruments")

type Construct = {
    lifecycle: Lifecycle
    ui: UIContext
    style?: Partial<CSSStyleDeclaration>
}

export const Instruments = ({lifecycle, ui, style}: Construct) => {
    const knob = (label: string, parameter: DefaultParameter<number>) => (
        <Knob lifecycle={lifecycle} label={label} parameter={parameter}
              onGestureBegin={() => ui.beginGesture(parameter)}
              onGestureEnd={() => ui.endGesture(parameter)}/>
    )
    // the keys below a section select the instrument the step keys edit
    const select = (index: int, label: string, single: boolean = false) => (
        <div className={Html.buildClassList("select", single && "single")}>
            <FunctionKey lifecycle={lifecycle} model={ui.instrumentKeys.byIndex(index)}
                         title={`Edit ${Instrument.All[index].name}`}
                         onPress={() => ui.selectInstrument(index)}/>
            <span>{label}</span>
        </div>
    )
    const group = (titles: ReadonlyArray<string>, ...children: ReadonlyArray<JsxValue>) => (
        <div className="instrument">
            {titles.map(title => <h1 className={titles.length === 1 ? "single" : ""}>{title}</h1>)}
            {children}
        </div>
    )
    const {preset} = ui
    const {bassdrum, snaredrum, tomLow, tomMid, tomHi, rim, clap, closedHihat, openedHihat, crash, ride} = preset
    const accent: HTMLElement = knob("", preset.accent)
    accent.classList.add("accent")
    return (
        <div className={className} style={style}>
            <hr/>
            {group(["TOTAL ACCENT"], accent)}
            <hr/>
            {group(["BASS DRUM"],
                knob("TUNE", bassdrum.tune), knob("LEVEL", bassdrum.level),
                knob("ATTACK", bassdrum.attack), knob("DECAY", bassdrum.decay), select(0, "BD", true))}
            <hr/>
            {group(["SNARE DRUM"],
                knob("TUNE", snaredrum.tune), knob("LEVEL", snaredrum.level),
                knob("TONE", snaredrum.tone), knob("SNAPPY", snaredrum.snappy), select(1, "SD", true))}
            <hr/>
            {group(["LOW TOM"], knob("TUNE", tomLow.tune), knob("LEVEL", tomLow.level), knob("DECAY", tomLow.decay),
                <div/>, select(2, "LT", true))}
            <hr/>
            {group(["MID TOM"], knob("TUNE", tomMid.tune), knob("LEVEL", tomMid.level), knob("DECAY", tomMid.decay),
                <div/>, select(3, "MT", true))}
            <hr/>
            {group(["HI TOM"], knob("TUNE", tomHi.tune), knob("LEVEL", tomHi.level), knob("DECAY", tomHi.decay),
                <div/>, select(4, "HT", true))}
            <hr/>
            {group(["RIM SHOT", "HAND CLAP"], knob("LEVEL", rim.level), knob("LEVEL", clap.level),
                <div/>, <div/>, select(5, "RS"), select(6, "HC"))}
            <hr/>
            {group(["HI HAT"],
                <div/>, knob("LEVEL", preset.hihatLevel),
                knob("CH DECAY", closedHihat.decay), knob("OH DECAY", openedHihat.decay),
                select(7, "CH"), select(8, "OH"))}
            <hr/>
            {group(["CYMBAL"],
                knob("LEVEL", crash.level), knob("LEVEL", ride.level),
                knob("CRASH TUNE", crash.tune), knob("RIDE TUNE", ride.tune),
                select(9, "CR"), select(10, "RD"))}
            <hr/>
        </div>
    )
}
