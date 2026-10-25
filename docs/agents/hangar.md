# The hangar

The hangar is a garage in real-time 3D (`src/render/hangar/`). `HangarScene` (`scene.ts`) owns the renderer, lights, camera and loading. The shell is built in code from scanned textures (`room.ts`), the props are downloaded models placed by `layout.ts`, and `props.ts` catalogues each asset with its credit.

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

## Lighting

- **Sun:** `SUN` in `scene.ts` is the one sun direction. It comes through the door, and through the side window, whose bars make stripes on the floor.
- **Bounce light:** rect area lights fake the bounce, as sky light from the door and window and warm light off the sunlit floor.
- **Room reflection:** `captureEnvironment` renders the room twice into the environment map, after each loading layer.
- **Plane spot:** `PLANE_SPOT` has to sit in the sun patch. The door's right jamb shades the right of the floor. After moving the sun or the plane, look from the door side and check that the plane is lit.

## Loading budget

Everything loads in layers: the plane and the room's surfaces, then the props, then the sky and garden. The loading screen covers only the first layer: `HangarScene.init` resolves once the room and the plane are up, and the props, sky and garden then arrive while the pilot looks round (`HangarScene.complete` resolves when the last is in). `index.html` draws the loading screen inline, so it shows before any script, and `src/ui/splash.ts` turns its tips and fills its bar, weighted by each part's download size (`LOAD_WEIGHT` in `scene.ts`). After 8 s the pilot can go in early. Back to hangar shows it again: the reload comes from cache, but takes about 3 s to build the scene.

- **Target:** a cold first visit shows the finished hangar within 10 s on 4G (9 Mbps). Now the plane is up at about 3 s and every prop at about 9 s, but the sky and garden take about 14 s: the ez-tree chunk inlines 3 MB of bark and leaf textures. Baking the garden into a small glb would bring it inside the target.
- **Size:** keep `public/assets/hangar/` near 7 MB. Props get small textures by default (512 px colour, half that for normal and roughness maps). Give 1024 px only to large props seen up close, and simplify dense meshes.
- **Measuring:** use a production build (`npx vite build && npx vite preview`) with network throttling and service workers blocked.

## Looking at it

Follow `verification.md` to drive a browser. Dev builds expose the scene as `window.hangar`:

- `hangar.lastGesture = 1e9` stops the slow turn.
- `hangar.yaw` and `hangar.pitch` (radians) set the orbit.
- For a plan view, stop the loop with `hangar.renderer.setAnimationLoop(null)`, place `hangar.camera` overhead, hide the ceiling meshes in the `room` group, and call `hangar.pipeline.render()`.
