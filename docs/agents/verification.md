# Verifying changes in the real app, and deploying

Unit tests cover `src/sim/`, the touch-stick, walk-mode, gamepad and USB-radio logic in `InputDevices` (radio setup included), and the walking `Pilot`. Anything visual, any other input, and audio have to be checked in a browser.

## Driving the app in a browser

1. **Start the dev server.** Run `npx vite --port 5173 --strictPort` in the background and poll `curl -sf http://localhost:5173` until it answers. To stop it, kill whatever is listening: `lsof -ti:5173 -sTCP:LISTEN | xargs kill`.
2. **Get a headless browser driver.** No browser CLI is installed. Install `playwright-core` into a scratch directory (outside the repo) and launch the system Google Chrome:
   `chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu', '--use-angle=metal'] })`.
   Headless Chrome on macOS runs the real WebGPU backend this way.
3. **Wait until the app is ready.** Dev builds expose the running app as `window.rcfsim` (a `FlightApp`). Wait for `window.rcfsim?.world` and for `.spinner` to disappear. Then read live state with `page.evaluate(() => window.rcfsim.sim.telemetry())` and check renderer state with `window.rcfsim.world.usingWebGPU`.
4. **Fly it.** Use keyboard input (`page.keyboard.down('KeyW')`, etc.; the full key list is the help card in `src/ui/HudPanel.vue`), take screenshots, and look at them. Collect `console` errors, `pageerror` events and failed responses. A clean run has none.

**Touch sticks.** Emulate a phone with `browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true })`. Playwright's `touchscreen` only taps, so drag the pads with CDP: `Input.dispatchTouchEvent` with `touchStart`/`touchMove`/`touchEnd` and one touch point per finger. Read the result from `window.rcfsim.input.state.sticks`.

**Gamepads and radios without the hardware.** Stub `navigator.getGamepads` in `page.addInitScript` to return objects shaped like a `Gamepad` (`id`, `connected`, `mapping: ''` for a sim cable, `axes`, `buttons`), and change their `axes` between frames. A pad flies once an axis has moved by more than 0.2. Read the result from `window.rcfsim.input.channels(...)`, `.radioIsTransmitter` and `.failsafe`. `input-probe.html` reads the same stub.

Hands-off at full power the plane climbs steeply. That is expected, because neutral elevator is trimmed for about 12.5 m/s. Scripted pull-ups at full power loop it into the ground, and that is pilot error, not a regression.

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`: typecheck, then tests, then build, then GitHub Pages. The site is served from the repo subpath on the owner's custom domain (https://hassan.umari.dev/rcwebsim/).

- **Base path:** CI builds with `BASE_PATH=/<repo>/`. Load runtime assets with _relative_ URLs (`assets/...`, `models/...`) so they resolve under that path. A leading `/` breaks them on Pages.
- **Checking a production build locally:** `BASE_PATH=/rcwebsim/ npx vite build && BASE_PATH=/rcwebsim/ npx vite preview`, then open `/rcwebsim/`.
- **Service worker (PWA).** `vite-plugin-pwa` in `vite.config.ts` precaches the whole build, including every file under `public/`, so the app installs and runs offline. A new file type under `public/` needs its extension added to `workbox.globPatterns`, or it won't load offline. The dev server registers no service worker. A production preview does, so a stale build can be served from cache: close the tab or clear site data before checking again. To check offline play, call `context.setOffline(true)` after the first load, reload, and wait for `.spinner` to disappear.
- **Icons.** `public/icon.svg` is the source. After editing it, run `npx pwa-assets-generator` to regenerate the PNGs and `favicon.ico`.
- **Watching a deploy:** `gh run watch <id> -R hasauino/rcwebsim --exit-status`.
