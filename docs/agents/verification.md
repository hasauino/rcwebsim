# Verifying changes in the real app, and deploying

Unit tests cover only `src/sim/`. Anything visual, input-related or audio-related has to be checked in a browser.

## Driving the app in a browser

1. **Start the dev server.** Run `npx vite --port 5173 --strictPort` in the background and poll `curl -sf http://localhost:5173` until it answers. To stop it, kill whatever is listening: `lsof -ti:5173 -sTCP:LISTEN | xargs kill`.
2. **Get a headless browser driver.** No browser CLI is installed. Install `playwright-core` into a scratch directory (outside the repo) and launch the system Google Chrome:
   `chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu', '--use-angle=metal'] })`.
   Headless Chrome on macOS runs the real WebGPU backend this way.
3. **Wait until the app is ready.** Dev builds expose the running app as `window.rcfsim` (a `FlightApp`). Wait for `window.rcfsim?.world` and for `.spinner` to disappear. Then read live state with `page.evaluate(() => window.rcfsim.sim.telemetry())` and check renderer state with `window.rcfsim.world.usingWebGPU`.
4. **Fly it.** Use keyboard input (`page.keyboard.down('KeyW')`, etc.; the full key list is the help card in `src/ui/HudPanel.vue`), take screenshots, and look at them. Collect `console` errors, `pageerror` events and failed responses. A clean run has none.

Hands-off at full power the plane climbs steeply. That is expected, because neutral elevator is trimmed for about 12.5 m/s. Scripted pull-ups at full power loop it into the ground, and that is pilot error, not a regression.

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`: typecheck, then tests, then build, then GitHub Pages. The site is served from the repo subpath on the owner's custom domain (https://hassan.umari.dev/rcwebsim/).

- **Base path:** CI builds with `BASE_PATH=/<repo>/`. Load runtime assets with _relative_ URLs (`assets/...`, `models/...`) so they resolve under that path. A leading `/` breaks them on Pages.
- **Checking a production build locally:** `BASE_PATH=/rcwebsim/ npx vite build && BASE_PATH=/rcwebsim/ npx vite preview`, then open `/rcwebsim/`.
- **Watching a deploy:** `gh run watch <id> -R hasauino/rcwebsim --exit-status`.
