![WCLAP-909 in openDAW](screenshot.jpg)
### Disclaimer
_**The use of any trade name or trademark is for identification and educational purposes only and does not imply any association with the trademark holder of their product brand.**_

### WCLAP-909
A drum machine modelled after the [Roland TR-909](https://en.wikipedia.org/wiki/Roland_TR-909) as a
[WebCLAP](https://github.com/WebCLAP) plugin: a minimal sequencer unit that plays the ten 909 instruments, tested in
[openDAW](https://opendaw.studio). The DSP is written in AssemblyScript and compiled to a CLAP `module.wasm`, the panel
is the plugin's webview page.

#### Instruments
- The keys below the instrument sections (BD ... RD) select the instrument the step keys edit.
- TOTAL ACCENT sets the distance between normal and accented steps (0 to 18 dB) without changing the overall loudness.
- Notes from the host (General MIDI drum map) play the instruments, velocities of 0.5 and above are accented.

#### Sequencer
- Click a step key: none → normal → accent → none (instruments with one level: on ↔ off).
  Shift+click goes straight to accent, or back to none on an accented step.
- Press a step key and drag over the others to paint them with the value it got.
- 8 patterns of up to 64 steps, selected with the PATTERN keys. While the host plays, the selection waits for the end of
  the running pattern.
- EDIT STEPS chooses which 16 steps the step keys show (1-16 ... 49-64). The range the pattern plays in flashes.
- LENGTH: the display shows the pattern length, − and + change it (hold to repeat).
- CLEAR clears the selected instrument, SCALE cycles the scale.
- SHUFFLE switches the display and − / + to the shuffle (0 to 6), click it again for the length.
- DOUBLE repeats the pattern once and doubles its length, COPY and PASTE copy patterns.
- Tempo and play/stop come from the host's transport (4/4 assumed).

### Layout

    dsp/assembly/       the plugin (AssemblyScript): CLAP entry, params, state, ports, gui/webview, voices, sequencer
    dsp/resources/      the samples, embedded into module.wasm by scripts/build-dsp.mjs
    ui/index.html       the webview page (the plugin's GUI), src/ holds its code
    index.html, host/   a WebCLAP test host: runs module.wasm in an AudioWorklet, shows the page in its plugin
                        window, relays messages, with transport, drum pads, parameters, state and a message log

The test host is adapted from the one in juce-webclap-plugins. The page and the plugin talk through the WebCLAP
webview channel in binary frames, see `dsp/assembly/protocol.ts`.

### Credits
Thanks to [Sascha Kaltenschnee](https://soundcloud.com/cyberpvnk) for lending me his [DinSync RE-909](https://www.kumptronics.com/shop/electronic-instruments/), which is an exact hardware copy of the original [TR-909](https://en.wikipedia.org/wiki/Roland_TR-909).

The "-909" of the logo is from a logo SVG by [Isaac Cotec](https://subaqueous.gumroad.com/l/hmOwu), the letters are drawn after it.

### Build
Built with [AssemblyScript](https://www.assemblyscript.org), [Vite](https://vite.dev), Sass and the openDAW UI
libraries (`@opendaw/lib-std`, `lib-dom`, `lib-jsx`).

    npm install
    npm run dev        # test host on http://127.0.0.1:5909, rebuilds module.wasm when dsp/ changes
    npm run build:dsp  # only module.wasm (public/module.wasm)
    npm run build      # dsp, type-check and bundle into dist/ (dist/ is the bundle: module.wasm, ui/)
    npm run pack       # build/wclap-909.wclap.tar.gz, the bundle hosts import (openDAW: "Import WebCLAP...")

### License
Copyright (c) 2022 André Michelle. Licensed under the [GNU Affero General Public License v3.0 or later](LICENSE).
