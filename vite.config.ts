import {defineConfig, Plugin} from "vite"
import {resolve} from "path"
import {execFile} from "child_process"

// Rebuilds module.wasm when the DSP sources change and reloads the pages (the host reloads the plugin)
const dspWatch = (): Plugin => ({
    name: "dsp-watch",
    apply: "serve",
    configureServer(server) {
        const sources = resolve(__dirname, "dsp")
        let building = false
        let pending = false
        const build = () => {
            if (building) {
                pending = true
                return
            }
            building = true
            execFile("node", [resolve(__dirname, "scripts/build-dsp.mjs")], (error, stdout, stderr) => {
                building = false
                if (error) {
                    server.config.logger.error(`[dsp] build failed\n${stdout}${stderr}`)
                } else {
                    server.config.logger.info(`[dsp] ${stdout.trim().split("\n").pop()}`)
                    server.ws.send({type: "full-reload"})
                }
                if (pending) {
                    pending = false
                    build()
                }
            })
        }
        server.watcher.add(sources)
        server.watcher.on("change", file => {
            if (file.startsWith(sources) && !file.endsWith("samples.ts")) {build()}
        })
    }
})

// The site is the WebCLAP bundle plus the test host: index.html (test host), ui/index.html (the plugin's
// webview page) and module.wasm (from public/, built by scripts/build-dsp.mjs).
export default defineConfig({
    base: "./",
    plugins: [dspWatch()],
    resolve: {
        alias: {
            "@": resolve(__dirname, "./src")
        }
    },
    build: {
        target: "esnext",
        sourcemap: true,
        rollupOptions: {
            input: {
                host: resolve(__dirname, "index.html"),
                ui: resolve(__dirname, "ui/index.html")
            }
        }
    },
    esbuild: {
        target: "esnext"
    },
    clearScreen: false,
    server: {
        port: 5909,
        strictPort: true,
        host: "127.0.0.1"
    }
})
