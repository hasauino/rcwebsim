# The hangar

The hangar is a garage in real-time 3D (`src/render/hangar/`). `HangarScene` (`scene.ts`) owns the renderer, lights, camera and loading. The shell is built in code from scanned textures (`room.ts`), the props are downloaded models placed by `layout.ts`, the garden outside is baked from the field's ez-tree trees, and `props.ts` catalogues each asset with its credit.

**Room frame:** metres, +x right, +y up, the open door on +z, the workbench on the back wall (−z). `ROOM` in `room.ts` holds the dimensions.

## Adding or replacing a prop

1. **Pick a model that looks real.** CC0, CC-BY or CC-BY-SA only. NC, ND and Sketchfab's Standard or Editorial licences block painting out logos or a paid app. Poly Haven downloads freely; Sketchfab needs the owner's API token in `~/.config/sketchfab/token`, and the script checks each model's licence there against the catalogue.
2. **Catalogue it** in `PROPS` (`props.ts`) with its title, author, licence and page URL. The Credits list reads this.
3. **Describe the conversion** in `SOURCES` in `scripts/hangar-assets.ts`, then run `node scripts/hangar-assets.ts <id>`. Downloads are cached in `.cache/hangar/`. The run prints the prop's size in metres. Check it against the real object, because sources come in any unit: Poly Haven's shelves are in decimetres and Sketchfab models in whatever the author used. Set `fit` to the real size.
   - **Logos:** dump the textures, find each logo's pixel rectangle, and list it in `delogo`. Use a flat `fill` on plain plastic, or `rows` on a scan so its shading survives.
   - **Backdrops:** some authors model a floor or backdrop in. Remove it with `drop`.
   - **Skinned meshes** are unskinned automatically.
4. **Place it** in `LAYOUT`. `at` is the prop's bottom centre. The workbench top is `BENCH` (0.966 m). Mark large props `big` so they still cast shadows on phones.
5. **Test.** `src/render/hangar/props.test.ts` fails if a shipped file is uncredited, a credit's licence is not allowed, or a catalogued prop is never placed.

## The garden

`scripts/hangar-garden.ts` grows the hedge and trees outside with ez-tree, the same presets and seeds as the field's trees, and bakes them into `garden.glb`. Each kind is grown once, then its bark is simplified and most of its leaf cards are dropped. The cards that are left grow to cover the same crown. Every plant is an instance of its kind. The layout lives in the script; re-run `node scripts/hangar-garden.ts` after changing it. At runtime, `loadGarden` (`room.ts`) gives the leaves the field's leaf material. `garden.test.ts` checks the triangle budget, and that nothing grows inside the garage or on the drive.

## Lighting

- **Sun:** `SUN` in `scene.ts` is the one sun direction. It comes through the door, and through the side window, whose bars make stripes on the floor.
- **Bounce light:** rect area lights fake the bounce, as sky light from the door and window and warm light off the sunlit floor.
- **Room reflection:** `captureEnvironment` renders the room twice into the environment map: once the room is up, and again once the sky and garden are in. The props and the plane stay out of it. Each capture is copied into the one environment texture, because a new texture would rebuild every shader in the room.
- **Plane spot:** `PLANE_SPOT` has to sit in the sun patch. The door's right jamb shades the right of the floor. After moving the sun or the plane, look from the door side and check that the plane is lit.

## Loading budget

Everything loads in layers: the plane and the room's surfaces, then the props, then the sky and garden. The loading screen covers the hangar until the last layer is in, when `HangarScene.init` resolves. A layer after the first that fails is left out. `index.html` draws the loading screen inline, so it shows before any script, and `src/ui/splash.ts` turns its tips and fills its bar, weighted by each layer's download size (`LOAD_WEIGHT` in `scene.ts`). Re-weigh it when a layer's size changes a lot. After 8 s the pilot can go in early and watch the rest arrive; the props fade in as they come.

Most of a warm load is three.js building WebGPU shaders in JavaScript, not downloading. Keep the number of shader builds down:

- Don't swap `scene.environment` for a new texture, because every material rebuilds.
- Don't flip a material's `transparent` or `alphaHash` after it has drawn.
- Build each new prop's shaders with `compileAsync` before adding it.
- Leave props out of the room capture.

**Targets**, measured on an M4 Mac at 2560×1440 and 100 Hz:

|                                              | Target                    | Now                                               |
| -------------------------------------------- | ------------------------- | ------------------------------------------------- |
| Loading screen gone, warm or fast connection | ≤ 1.5 s                   | 1.0 s                                             |
| Back to hangar, loading screen gone          | ≤ 1.5 s                   | 0.7 s                                             |
| Cold 4G (9 Mbps): loading screen gone        | ≤ 10 s                    | 10.4 s, about the time the props take to download |
| Orbiting, frame time                         | ≤ 10 ms, a locked 100 fps | p50 7.5 ms, p95 9 ms                              |

- **Frame cost:** the scene draws about 0.7 M triangles from the camera and again from the sun. Live screen-space effects are out. GTAO cost two-thirds of each frame here, so the grounding comes from the contact shadows under the plane. The garden keeps to 150 k triangles (`garden.test.ts`).
- **Size:** keep `public/assets/hangar/` near 7 MB. Props get small textures by default (512 px colour, half that for normal and roughness maps). Give 1024 px only to large props seen up close, and simplify dense meshes.
- **Measuring:** use a production build (`npx vite build && npx vite preview`) in headless Chrome (see `verification.md`).
  - **Load:** time the `gone` class on `#splash`, which goes once every layer is in. Throttle with CDP `Network.emulateNetworkConditions` for 4G.
  - **Frame time:** launch with `--disable-gpu-vsync --disable-frame-rate-limit`, wait until the page has loaded, then time `requestAnimationFrame` gaps while dragging the orbit with the mouse. With those flags set from the start, a load can stall.

## Looking at it

Follow `verification.md` to drive a browser. Dev builds expose the scene as `window.hangar`:

- `hangar.lastGesture = 1e9` stops the slow turn.
- `hangar.yaw` and `hangar.pitch` (radians) set the orbit.
- For a plan view, stop the loop with `hangar.renderer.setAnimationLoop(null)`, place `hangar.camera` overhead, hide the ceiling meshes in the `room` group, and call `hangar.renderer.render(hangar.scene, hangar.camera)`.
