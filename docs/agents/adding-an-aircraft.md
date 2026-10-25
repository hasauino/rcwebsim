# Adding or changing an aircraft

An aircraft is one `AircraftSpec` file in `src/sim/aircraft/`. `pa18.ts` (a trainer) and `extra300.ts` (an aerobat) are the worked examples, and their `provenance` notes show what is sourced, derived, estimated and tuned.

1. **Gather sources.** Collect the manual's span, wing area, flying weight, CG and its recommended range (`cgRange`), throws, expo, motor, ESC, battery and prop, and record each as `sourced` with a link. Horizon Hobby manuals download from `www.horizonhobby.com/on/demandware.static/...`, and the product page's specs tab often adds the prop and airfoil. Look up the airfoil coordinates in the UIUC database.
2. **Polars.** If the airfoil has no table in `src/sim/data/`, generate one with `scripts/gen_polars.py` (see `docs/polars.md`), add it to `AirfoilId` and register it in `airfoil.ts`. Tail surfaces get a symmetric section. Symmetric aerobat wings use NACA 0012.
3. **Geometry from the visual model.**
   - Measure the glTF's vertices (wing leading edge, chord, wheel contact points, tail surfaces, spinner) and scale the model to the real span.
   - Set `model.scale`, `rotationDeg` and `offset` so its wing root leading edge lands on the datum, nose to −z, right wing to +x. `scale` is per body axis: a full-scale model can be stretched to the RC model's proportions (the Extra 300 is 1.15× longer than scale, matching the manual's length and wing area).
   - Derive the gear, tail, prop position and collision boxes from those measurements, so the wheels touch the ground (ADR-0010).
   - Check that no collision box reaches below the wheel contact plane at the ground attitude; a box that does crashes the plane while it sits still.
   - Add the aircraft to `SPECS` in `scripts/side-view.ts`, then run `node scripts/side-view.ts <id>` to trace the side silhouette the Balance settings tab draws.
4. **Animated parts.** Each moving part must be its own glTF node with its origin on the hinge line (or prop hub). Keep the export in `models-src/<id>/` and add an entry to `MODELS` in `scripts/split-model.ts`, then run `node scripts/split-model.ts <id>`:
   - It picks triangles or connected pieces by box, and cuts along a plane where there is no seam.
   - It orients each node's local +X along the hinge in the positive-deflection sense. A hinge can be found from vertices in a box, or given as two measured points (`through`), which suits a swept or slanted hinge.
   - A spin pivot can name the blade disc's centre (`hub`) when the spinner's middle is elsewhere.
   - It copies the export's textures next to the output.

   List the nodes in `model.nodes`, keyed like telemetry `deflections` (`aileron.left`). glTF names must not contain `.`, because three.js strips it. `src/render/model-binding.test.ts` runs for every aircraft. It checks every deflection is bound and moves the trailing edge (the surface's most aft vertex) the right way, and that the prop spins about the thrust line. A model from another format needs its own conversion step first; `scripts/extra300/` converts a `.blend` and repaints its skin.

5. **Validate.** `validateAircraft(spec)` must return `[]`: every number covered by provenance, every `sourced` entry has a source, and no surface is driven by throttle.
6. **Envelope tests.** Write `src/sim/aircraft/<id>.envelope.test.ts`. The scenarios (settle, static thrust, takeoff, glide, cruise, stall, kicks, roll rate, axial roll, knife edge) live in `src/sim/test-pilots.ts` and return what they measured. Each test file holds the aircraft's bands, with the evidence next to them: stall speed from wing loading, glide ratio, roll rate, static thrust. Aerobats add axial roll and knife edge. Tune `estimated` values until they pass, and mark what you tuned (ADR-0004).
   - A deep, flat-sided fuselage needs a `sideForceSlope` body for knife edge (see `docs/agents/physics.md`).
7. **Wire it in.** Add the spec to `AIRCRAFT` in `src/sim/aircraft/index.ts` and give it a `role` and a one-line `summary`. The start screen lists it, previews it and remembers it. Transmitter memory, CG and build are saved per aircraft id; a new memory starts from `lowRates` and `defaultExpo`. If the model is not the PA-18's, the service worker caches it on first use instead of precaching it (`vite.config.ts`). Credit the model in `ASSETS.md` and keep its licence file next to it.
