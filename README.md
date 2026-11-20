# Scream Bird

A side-scrolling flying game you control **only with your voice**. Make noise to fly up, go quiet to fall, and get through the gaps between the crystal pillars.

The only click is the one browsers require to allow the microphone. After that, calibrating, starting, playing and restarting are all done by voice.

## Play locally

Needs Node.js 18 or newer. There are no dependencies to install.

```sh
npm start
# open http://localhost:8080
```

Browsers only allow the microphone on `https://` or `localhost`. Opening the game from your LAN IP over plain `http://` won't work.

Add `?debug` to the URL to see live dB readings (noise floor, gate, peak, level) in the corner.

## How to play

1. Click **Enable microphone** and allow access.
2. **Calibration (about 5 seconds):** stay quiet while it measures your room, then scream when it says so. This sets the range from "silent" to "your loudest", so it works whether you whisper-shout or full-on scream.
3. **Make some noise** to start.
4. After a crash, **shout** to fly again. If you're still screaming when you crash, stop first and then shout again.

### Control modes

| Mode | How it works |
|---|---|
| **Scream** (default) | Hold a sound to rise. Volume sets how hard you climb; silence lets gravity win. About half volume hovers. |
| **Classic** | Each short shout is one flap. A long "AAAH" is one flap, not twenty. |

Open **Settings** (gear button or `Esc`) to switch mode, change sensitivity, show or hide the volume meter, turn on sound effects, or recalibrate. The best score is saved separately for each mode.

### Tips

- **The volume meter** on the left shows your loudness live. Below the pink line counts as silence. At the white line you're at full power.
- **Sound effects are off by default.** The game turns off the browser's echo cancellation (otherwise it would flatten your screams), so sound from the speakers would leak into the mic and move the bird. Use headphones if you turn them on.
- **If background noise moves the bird,** lower the sensitivity or recalibrate. If you have to strain, raise it. The noise floor also adjusts slowly by itself, e.g. when a fan switches on.

## How it works

```
mic → Web Audio AnalyserNode → loudness (RMS, dB) → envelope (fast attack, slow release)
    → level 0..1 between the gate and top marks → bird thrust (Scream) / burst → flap (Classic)
```

- `getUserMedia` is opened with `echoCancellation`, `noiseSuppression` and `autoGainControl` **off**. Auto-gain in particular would make quiet and loud sound the same.
- **Calibration** takes the 90th percentile of the quiet phase as the noise floor, and of the scream as the peak. If nobody screams within 10 seconds, it falls back to a default range.
- **Classic mode flaps** use two thresholds plus a 120 ms cooldown, so one sound gives one flap.
- **Physics** runs at a fixed 120 Hz step, so the game plays the same at any frame rate.
- **The world** is 480×720 units, scaled to fit any screen, desktop or phone.

```
index.html, styles.css
src/main.js             game loop, state machine, settings
src/audio/mic.js        microphone + AnalyserNode
src/audio/voice.js      loudness, smoothing, calibration, flap detection (pure, tested)
src/audio/sfx.js        optional synthesized sound effects
src/game/physics.js     world constants, mode tuning, bird physics, collisions
src/game/obstacles.js   pillar spawning, difficulty ramp, scoring
src/game/render.js      all canvas drawing
src/ui/screens.js       calibration / ready / game-over screens
src/ui/storage.js       settings and best scores in localStorage
```

Gameplay tuning (gravity, thrust, gap sizes, speeds) lives in `MODES` in `src/game/physics.js`. Voice tuning (smoothing, thresholds, cooldown) lives in `VOICE_DEFAULTS` in `src/audio/voice.js`.

## Tests

```sh
npm test          # unit tests: synthetic audio through the voice pipeline, physics, obstacles
npm run test:e2e  # real Chromium with a fake microphone playing a generated scream
```

The end-to-end test generates a WAV (silence, a scream, then shout/pause bursts) and feeds it to Chromium as the microphone. It then checks that the game calibrates, starts, moves the bird, crashes and restarts with no input except the "voice". It needs the `playwright` package and Chromium (`npm install --no-save playwright && npx playwright install chromium`). Set `SCREENSHOT_DIR=some/dir` to save screenshots of each stage.

## Deploy

`.github/workflows/pages.yml` publishes the game to GitHub Pages on every push to the default branch. One-time setup: in the repository go to **Settings → Pages** and set **Source** to **GitHub Actions**. Pages serves over HTTPS, so the microphone works there.

`.github/workflows/ci.yml` runs the unit and end-to-end tests on every push and pull request.
