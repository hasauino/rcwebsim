# Verifying changes in the real app, and deploying

Unit tests cover `src/sim/`, every aircraft model's moving-part binding (`src/render/model-binding.test.ts`), the touch-stick, walk-mode, gamepad and USB-radio logic in `InputDevices` (radio setup included), and the walking `Pilot`. Anything visual, any other input, and audio have to be checked in a browser.

## Driving the app in a browser

1. **Start the dev server.** Run `npx vite --port 5173 --strictPort` in the background and poll `curl -sf http://localhost:5173` until it answers. To stop it, kill whatever is listening: `lsof -ti:5173 -sTCP:LISTEN | xargs kill`.
2. **Get a headless browser driver.** No browser CLI is installed. Install `playwright-core` into a scratch directory (outside the repo) and launch the system Google Chrome:
   `chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu', '--use-angle=metal'] })`.
   Headless Chrome on macOS runs the real WebGPU backend this way.
3. **Wait until the app is ready.** It opens on the loading screen, then the hangar: wait for `#splash` to be hidden (it comes back on Back to hangar; `Enter` flies even before then), pick an aircraft with the arrow keys (the last one chosen is preselected), and press `Enter` to fly. Dev builds then expose the running app as `window.rcfsim` (a `FlightApp`; `window.rcfsim.aircraft.id` says which plane). Wait for `window.rcfsim?.world` and for `.spinner` to disappear. Then read live state with `page.evaluate(() => window.rcfsim.sim.telemetry())` and check renderer state with `window.rcfsim.world.usingWebGPU`.
4. **Fly it.** Use keyboard input (`page.keyboard.down('KeyW')`, etc.; the full key list is the help card in `src/ui/HudPanel.vue`), take screenshots, and look at them. Collect `console` errors, `pageerror` events and failed responses. A clean run has none.

**Touch sticks.** Emulate a phone with `browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true })`. Playwright's `touchscreen` only taps, so drag the pads with CDP: `Input.dispatchTouchEvent` with `touchStart`/`touchMove`/`touchEnd` and one touch point per finger. Read the result from `window.rcfsim.input.state.sticks`.

**Gamepads and radios without the hardware.** Stub `navigator.getGamepads` in `page.addInitScript` to return objects shaped like a `Gamepad` (`id`, `connected`, `mapping: ''` for a sim cable, `axes`, `buttons`), and change their `axes` between frames. A pad flies once an axis has moved by more than 0.2. Read the result from `window.rcfsim.input.channels(...)`, `.radioIsTransmitter` and `.failsafe`. `input-probe.html` reads the same stub.

Hands-off at full power the plane climbs steeply. That is expected, because neutral elevator is trimmed for about 12.5 m/s. Scripted pull-ups at full power loop it into the ground, and that is pilot error, not a regression.

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`: typecheck, then tests, then build, then GitHub Pages. The site is served from the root of its custom domain (https://rcwebsim.umari.dev/), set in the repo's Pages settings. DNS has a `CNAME` from `rcwebsim.umari.dev` to `hasauino.github.io`.

- **Base path:** CI builds for `/`. `BASE_PATH=/sub/` builds for a subpath. Load runtime assets with _relative_ URLs (`assets/...`, `models/...`) so the build works under any base path.
- **Checking a production build locally:** `npx vite build && npx vite preview`. To check a subpath build: `BASE_PATH=/rcwebsim/ npx vite build && BASE_PATH=/rcwebsim/ npx vite preview`, then open `/rcwebsim/`.
- **Service worker (PWA).** `vite-plugin-pwa` in `vite.config.ts` precaches the whole build, including every file under `public/` except the models of aircraft other than the PA-18 and the hangar's props, so the app installs and runs offline. Those are cached the first time they load. The app registers the worker itself (`src/app/offline.ts`) once the hangar has loaded, or once a flight has started, so its precache never competes with the hangar's first download. A new file type under `public/` needs its extension added to `workbox.globPatterns`, or it won't load offline. The dev server registers no service worker. A production preview does, so a stale build can be served from cache: close the tab or clear site data before checking again. To check offline play, call `context.setOffline(true)` after the first load, reload, and wait for `.spinner` to disappear.
- **Icons.** `public/icon.svg` is the source. After editing it, run `npx pwa-assets-generator` to regenerate the PNGs and `favicon.ico`.
- **Watching a deploy:** `gh run watch <id> -R hasauino/rcwebsim --exit-status`.
