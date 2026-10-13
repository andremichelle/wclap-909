// The WebCLAP module: clap_entry, the plugin factory and the C ABI of the plugin and its extensions.
// Every function here is placed in the exported function table, the host calls them through pointers.

import {
    AudioPortInfo,
    cstring,
    cstringEquals,
    Entry,
    NotePortInfo,
    ParamInfo,
    writeText
} from "./clap"
import {formatValue, PARAMS, ParamId, parseValue} from "./params"
import {hostExtension, Plugin} from "./plugin"

const PLUGIN_ID = "andremichelle.wclap-909"
const WEBVIEW_URI = "/ui/index.html"
const GUI_WIDTH: u32 = 1164
const GUI_HEIGHT: u32 = 598
const PROCESS_CONTINUE: i32 = 1

// Filled in at the end of the module (function indices are known only below their declarations)
let DESCRIPTOR: usize = 0
let GUI_API: usize = 0
let PORT_TYPE_STEREO: usize = 0
let FACTORY: usize = 0
let PARAMS_EXT: usize = 0
let STATE_EXT: usize = 0
let AUDIO_PORTS_EXT: usize = 0
let NOTE_PORTS_EXT: usize = 0
let GUI_EXT: usize = 0
let WEBVIEW_EXT: usize = 0

// Traps instead of importing env.abort, the module has no imports at all
export function onAbort(_message: usize, _file: usize, _line: u32, _column: u32): void {unreachable()}

// The host allocates its structs and strings in our memory
export function malloc(size: usize): usize {return heap.alloc(size)}

export function free(ptr: usize): void {heap.free(ptr)}

@inline function self(plugin: usize): Plugin {return changetype<Plugin>(load<usize>(plugin, 4))}

// ---------------------------------------------------------------------------------------------------------------
// clap_plugin

function pluginInit(plugin: usize): bool {
    const instance = self(plugin)
    instance.hostParams = hostExtension(instance.host, "clap.params")
    instance.hostWebview = hostExtension(instance.host, "clap.webview/3")
    return true
}

function pluginDestroy(_plugin: usize): void {}

function pluginActivate(plugin: usize, sampleRate: f64, _minFrames: u32, maxFrames: u32): bool {
    return self(plugin).activate(sampleRate, maxFrames)
}

function pluginDeactivate(_plugin: usize): void {}

function pluginStartProcessing(_plugin: usize): bool {return true}

function pluginStopProcessing(_plugin: usize): void {}

function pluginReset(plugin: usize): void {self(plugin).reset()}

function pluginProcess(plugin: usize, process: usize): i32 {
    self(plugin).process(process)
    return PROCESS_CONTINUE
}

function pluginGetExtension(_plugin: usize, id: usize): usize {
    if (cstringEquals(id, "clap.params")) return PARAMS_EXT
    if (cstringEquals(id, "clap.state")) return STATE_EXT
    if (cstringEquals(id, "clap.audio-ports")) return AUDIO_PORTS_EXT
    if (cstringEquals(id, "clap.note-ports")) return NOTE_PORTS_EXT
    if (cstringEquals(id, "clap.gui")) return GUI_EXT
    if (cstringEquals(id, "clap.webview/3")) return WEBVIEW_EXT
    return 0
}

function pluginOnMainThread(plugin: usize): void {self(plugin).onMainThread()}

// ---------------------------------------------------------------------------------------------------------------
// clap.params

function paramsCount(_plugin: usize): u32 {return ParamId.Count}

function paramsGetInfo(_plugin: usize, index: u32, info: usize): bool {
    if (index >= ParamId.Count) return false
    const def = PARAMS[index]
    memory.fill(info, 0, ParamInfo.DEFAULT + 8)
    store<u32>(info + ParamInfo.ID, def.id)
    store<u32>(info + ParamInfo.FLAGS, ParamInfo.IS_AUTOMATABLE)
    writeText(info + ParamInfo.NAME, ParamInfo.NAME_SIZE, def.name)
    writeText(info + ParamInfo.MODULE, ParamInfo.MODULE_SIZE, def.module)
    store<f64>(info + ParamInfo.MIN, 0.0)
    store<f64>(info + ParamInfo.MAX, 1.0)
    store<f64>(info + ParamInfo.DEFAULT, def.defaultUnit)
    return true
}

function paramsGetValue(plugin: usize, id: u32, out: usize): bool {
    if (id >= ParamId.Count) return false
    store<f64>(out, self(plugin).params.unit(id))
    return true
}

function paramsValueToText(_plugin: usize, id: u32, value: f64, out: usize, capacity: u32): bool {
    return formatValue(id, value, out, capacity)
}

function paramsTextToValue(_plugin: usize, id: u32, text: usize, out: usize): bool {
    const value = parseValue(id, text)
    if (isNaN(value)) return false
    store<f64>(out, value)
    return true
}

function paramsFlush(plugin: usize, inEvents: usize, outEvents: usize): void {self(plugin).flush(inEvents, outEvents)}

// ---------------------------------------------------------------------------------------------------------------
// clap.state

function stateSave(plugin: usize, stream: usize): bool {
    const instance = self(plugin)
    const size = instance.stateSize()
    const buffer = heap.alloc(size)
    instance.writeState(buffer)
    let written = 0
    while (written < size) {
        const n = call_indirect<i64>(load<u32>(stream + 4), stream, buffer + written, <u64>(size - written))
        if (n <= 0) break
        written += <i32>n
    }
    heap.free(buffer)
    return written == size
}

function stateLoad(plugin: usize, stream: usize): bool {
    const instance = self(plugin)
    const capacity = instance.stateSize() + 1024
    const buffer = heap.alloc(capacity)
    let read = 0
    while (read < capacity) {
        const n = call_indirect<i64>(load<u32>(stream + 4), stream, buffer + read, <u64>(capacity - read))
        if (n <= 0) break
        read += <i32>n
    }
    const result = instance.readState(buffer, read)
    heap.free(buffer)
    return result
}

// ---------------------------------------------------------------------------------------------------------------
// clap.audio-ports, clap.note-ports

function audioPortsCount(_plugin: usize, isInput: bool): u32 {return isInput ? 0 : 1}

function audioPortsGet(_plugin: usize, index: u32, isInput: bool, info: usize): bool {
    if (isInput || index != 0) return false
    memory.fill(info, 0, AudioPortInfo.IN_PLACE_PAIR + 4)
    store<u32>(info + AudioPortInfo.ID, 0)
    writeText(info + AudioPortInfo.NAME, 256, "Main")
    store<u32>(info + AudioPortInfo.FLAGS, AudioPortInfo.IS_MAIN)
    store<u32>(info + AudioPortInfo.CHANNEL_COUNT, 2)
    store<usize>(info + AudioPortInfo.PORT_TYPE, PORT_TYPE_STEREO)
    store<u32>(info + AudioPortInfo.IN_PLACE_PAIR, 0xffffffff)
    return true
}

function notePortsCount(_plugin: usize, isInput: bool): u32 {return isInput ? 1 : 0}

function notePortsGet(_plugin: usize, index: u32, isInput: bool, info: usize): bool {
    if (!isInput || index != 0) return false
    memory.fill(info, 0, NotePortInfo.NAME + 256)
    store<u32>(info + NotePortInfo.ID, 0)
    store<u32>(info + NotePortInfo.SUPPORTED_DIALECTS, NotePortInfo.DIALECT_CLAP | NotePortInfo.DIALECT_MIDI)
    store<u32>(info + NotePortInfo.PREFERRED_DIALECT, NotePortInfo.DIALECT_CLAP)
    writeText(info + NotePortInfo.NAME, 256, "Triggers")
    return true
}

// ---------------------------------------------------------------------------------------------------------------
// clap.gui (webview API only) and clap.webview

function guiIsApiSupported(_plugin: usize, api: usize, isFloating: bool): bool {
    return !isFloating && cstringEquals(api, "webview")
}

function guiGetPreferredApi(_plugin: usize, api: usize, isFloating: usize): bool {
    store<usize>(api, GUI_API)
    if (isFloating != 0) store<u8>(isFloating, 0)
    return true
}

function guiCreate(plugin: usize, api: usize, isFloating: bool): bool {
    if (!guiIsApiSupported(plugin, api, isFloating)) return false
    self(plugin).guiOpen = true
    return true
}

function guiDestroy(plugin: usize): void {self(plugin).guiOpen = false}

function guiSetScale(_plugin: usize, _scale: f64): bool {return false}

function guiGetSize(_plugin: usize, width: usize, height: usize): bool {
    store<u32>(width, GUI_WIDTH)
    store<u32>(height, GUI_HEIGHT)
    return true
}

function guiCanResize(_plugin: usize): bool {return true}

function guiGetResizeHints(_plugin: usize, _hints: usize): bool {return false}

function guiAdjustSize(_plugin: usize, _width: usize, _height: usize): bool {return true}

function guiSetSize(_plugin: usize, _width: u32, _height: u32): bool {return true}

function guiSetParent(_plugin: usize, _window: usize): bool {return true}

function guiSetTransient(_plugin: usize, _window: usize): bool {return false}

function guiSuggestTitle(_plugin: usize, _title: usize): void {}

function guiShow(_plugin: usize): bool {return true}

function guiHide(_plugin: usize): bool {return true}

function webviewGetUri(_plugin: usize, out: usize, capacity: u32): i32 {
    if (out != 0 && capacity > 0) writeText(out, capacity, WEBVIEW_URI)
    return WEBVIEW_URI.length
}

function webviewGetResource(_plugin: usize, _path: usize, _mime: usize, _mimeCapacity: u32, _stream: usize): bool {
    return false
}

function webviewReceive(plugin: usize, buffer: usize, size: u32): bool {return self(plugin).receive(buffer, size)}

// ---------------------------------------------------------------------------------------------------------------
// Factory and entry

function factoryGetPluginCount(_factory: usize): u32 {return 1}

function factoryGetPluginDescriptor(_factory: usize, index: u32): usize {return index == 0 ? DESCRIPTOR : 0}

function factoryCreatePlugin(_factory: usize, host: usize, id: usize): usize {
    if (!cstringEquals(id, PLUGIN_ID)) return 0
    const instance = new Plugin(host)
    const plugin = heap.alloc(48)
    store<usize>(plugin, DESCRIPTOR)
    store<usize>(plugin + 4, changetype<usize>(instance))
    store<u32>(plugin + 8, pluginInit.index)
    store<u32>(plugin + 12, pluginDestroy.index)
    store<u32>(plugin + 16, pluginActivate.index)
    store<u32>(plugin + 20, pluginDeactivate.index)
    store<u32>(plugin + 24, pluginStartProcessing.index)
    store<u32>(plugin + 28, pluginStopProcessing.index)
    store<u32>(plugin + 32, pluginReset.index)
    store<u32>(plugin + 36, pluginProcess.index)
    store<u32>(plugin + 40, pluginGetExtension.index)
    store<u32>(plugin + 44, pluginOnMainThread.index)
    return plugin
}

function entryInit(_path: usize): bool {return true}

function entryDeinit(): void {}

function entryGetFactory(id: usize): usize {return cstringEquals(id, "clap.plugin-factory") ? FACTORY : 0}

function table(indices: StaticArray<u32>): usize {
    const ptr = heap.alloc(indices.length << 2)
    for (let i = 0; i < indices.length; i++) store<u32>(ptr + (i << 2), indices[i])
    return ptr
}

function createDescriptor(): usize {
    const ptr = heap.alloc(48)
    store<u32>(ptr, 1)       // clap_version 1.2.0
    store<u32>(ptr + 4, 2)
    store<u32>(ptr + 8, 0)
    store<usize>(ptr + 12, cstring(PLUGIN_ID))
    store<usize>(ptr + 16, cstring("WCLAP-909"))
    store<usize>(ptr + 20, cstring("André Michelle"))
    store<usize>(ptr + 24, cstring("https://github.com/andremichelle/tr-909"))
    store<usize>(ptr + 28, cstring(""))
    store<usize>(ptr + 32, cstring(""))
    store<usize>(ptr + 36, cstring("0.1.0"))
    store<usize>(ptr + 40, cstring("A minimal 909-style drum machine: 10 instruments, 8 patterns of up to 64 steps"))
    const features = heap.alloc(16)
    store<usize>(features, cstring("instrument"))
    store<usize>(features + 4, cstring("drum-machine"))
    store<usize>(features + 8, cstring("stereo"))
    store<usize>(features + 12, 0)
    store<usize>(ptr + 44, features)
    return ptr
}

DESCRIPTOR = createDescriptor()
GUI_API = cstring("webview")
PORT_TYPE_STEREO = cstring("stereo")
FACTORY = table([factoryGetPluginCount.index, factoryGetPluginDescriptor.index, factoryCreatePlugin.index])
PARAMS_EXT = table([paramsCount.index, paramsGetInfo.index, paramsGetValue.index,
    paramsValueToText.index, paramsTextToValue.index, paramsFlush.index])
STATE_EXT = table([stateSave.index, stateLoad.index])
AUDIO_PORTS_EXT = table([audioPortsCount.index, audioPortsGet.index])
NOTE_PORTS_EXT = table([notePortsCount.index, notePortsGet.index])
GUI_EXT = table([guiIsApiSupported.index, guiGetPreferredApi.index, guiCreate.index, guiDestroy.index,
    guiSetScale.index, guiGetSize.index, guiCanResize.index, guiGetResizeHints.index, guiAdjustSize.index,
    guiSetSize.index, guiSetParent.index, guiSetTransient.index, guiSuggestTitle.index, guiShow.index, guiHide.index])
WEBVIEW_EXT = table([webviewGetUri.index, webviewGetResource.index, webviewReceive.index])

const ENTRY: usize = memory.data(Entry.SIZE, 4)
store<u32>(ENTRY, 1)
store<u32>(ENTRY + 4, 2)
store<u32>(ENTRY + 8, 0)
store<u32>(ENTRY + Entry.INIT, entryInit.index)
store<u32>(ENTRY + Entry.DEINIT, entryDeinit.index)
store<u32>(ENTRY + Entry.GET_FACTORY, entryGetFactory.index)

export const clap_entry: usize = ENTRY
