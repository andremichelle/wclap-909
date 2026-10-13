// Builds the WebCLAP bundle and packs it into the .wclap.tar.gz hosts import (openDAW: "Import WebCLAP...").
//
// build/wclap-909.wclap/      module.wasm, ui/index.html, assets/ (the page), LICENSE
// build/wclap-909.wclap.tar.gz
//
// The archive holds one top directory named like the bundle, plain ustar entries only (no pax headers, no macOS
// ._ files), sorted, with fixed times and owners, so the same bundle always gives the same bytes (like
// scripts/pack-wclap.py in juce-webclap-plugins).

import {execFileSync} from "node:child_process"
import {copyFileSync, readdirSync, readFileSync, statSync, writeFileSync} from "node:fs"
import {dirname, join, relative, resolve, sep} from "node:path"
import {fileURLToPath} from "node:url"
import {gzipSync} from "node:zlib"
import {build} from "vite"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const name = "wclap-909.wclap"
const bundle = join(root, "build", name)
const output = `${bundle}.tar.gz`

execFileSync("node", [join(root, "scripts/build-dsp.mjs")], {stdio: "inherit"})

// The page only, its assets inside the bundle, no source maps and no test host
// (an own config: vite.config.ts also builds the test host, and vite would merge its inputs with ours)
await build({
    root,
    configFile: false,
    base: "./",
    publicDir: false,
    logLevel: "warn",
    resolve: {alias: {"@": join(root, "src")}},
    esbuild: {target: "esnext"},
    build: {
        target: "esnext",
        outDir: bundle,
        emptyOutDir: true,
        sourcemap: false,
        rollupOptions: {input: {ui: join(root, "ui/index.html")}}
    }
})
copyFileSync(join(root, "public/module.wasm"), join(bundle, "module.wasm"))
copyFileSync(join(root, "LICENSE"), join(bundle, "LICENSE"))

const files = []
const walk = directory => {
    for (const entry of readdirSync(directory).filter(entry => !entry.startsWith(".")).sort()) {
        const path = join(directory, entry)
        if (statSync(path).isDirectory()) walk(path)
        else files.push(path)
    }
}
walk(bundle)

const header = (path, size) => {
    const block = Buffer.alloc(512)
    let prefix = "", base = path
    if (base.length > 100) {
        const cut = base.lastIndexOf("/", 155)
        prefix = base.slice(0, cut)
        base = base.slice(cut + 1)
    }
    const field = (offset, length, value) => block.write(value, offset, length, "ascii")
    const octal = (offset, length, value) => field(offset, length, value.toString(8).padStart(length - 1, "0") + "\0")
    field(0, 100, base)
    octal(100, 8, 0o644)
    octal(108, 8, 0)
    octal(116, 8, 0)
    octal(124, 12, size)
    octal(136, 12, 0)
    field(148, 8, "        ")
    field(156, 1, "0")
    field(257, 6, "ustar\0")
    field(263, 2, "00")
    field(345, 155, prefix)
    let sum = 0
    for (const byte of block) sum += byte
    field(148, 8, sum.toString(8).padStart(6, "0") + "\0 ")
    return block
}

const chunks = []
for (const path of files) {
    const data = readFileSync(path)
    chunks.push(header(`${name}/${relative(bundle, path).split(sep).join("/")}`, data.length), data)
    const padding = (512 - data.length % 512) % 512
    if (padding > 0) chunks.push(Buffer.alloc(padding))
}
chunks.push(Buffer.alloc(1024))
// gzip without a file name and with mtime 0 (node writes both that way)
writeFileSync(output, gzipSync(Buffer.concat(chunks), {level: 9}))
console.log(`${relative(root, output)}: ${files.length} files, ${(statSync(output).size / 1048576).toFixed(2)} MB`)
for (const path of files) console.log(`  ${name}/${relative(bundle, path).split(sep).join("/")}`)
