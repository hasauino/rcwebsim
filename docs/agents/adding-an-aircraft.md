# Adding or changing an aircraft

An aircraft is one `AircraftSpec` file in `src/sim/aircraft/`. `pa18.ts` is the worked example, and its `provenance` notes show what is sourced, derived, estimated and tuned.

1. **Gather sources.** Collect the manual's span, wing area, flying weight, CG and its recommended range (`cgRange`), throws, motor, ESC, battery and prop, and record each as `sourced` with a link. Look up the airfoil coordinates in the UIUC database.
2. **Polars.** If the airfoil has no table in `src/sim/data/`, generate one with `scripts/gen_polars.py` (see `docs/polars.md`), add it to `AirfoilId` and register it in `airfoil.ts`. Tail surfaces get a symmetric section.
3. **Geometry from the visual model.**
   - Measure the glTF's vertices (wing leading edge, chord, wheel contact points, tail surfaces, spinner) and scale the model to the real span.
   - Set `model.scale`, `rotationDeg` and `offset` so its wing root leading edge lands on the datum, nose to −z, right wing to +x.
   - Derive the gear, tail, prop position and collision boxes from those measurements, so the wheels touch the ground (ADR-0010).
   - Check that no collision box reaches below the wheel contact plane at the ground attitude; a box that does crashes the plane while it sits still.
   - Set `AIRCRAFT` and `OUTPUT` in `scripts/side-view.ts`, then run `node scripts/side-view.ts` to trace the side silhouette the Balance settings tab draws.
4. **Animated parts.** Each moving part must be its own glTF node with its origin on the hinge line (or prop hub). If the export merges them, keep it in `models-src/` and set `PARTS` in `scripts/split-model.ts` to cut them out: it picks triangles or connected pieces by box, cuts along a plane where there is no seam, and orients each node's local +X along the hinge in the positive-deflection sense. List the nodes in `model.nodes`, keyed like telemetry `deflections` (`aileron.left`). glTF names must not contain `.`, because three.js strips it. `src/render/model-binding.test.ts` checks every deflection is bound and moves the trailing edge the right way, and that the prop spins about the thrust line.
5. **Validate.** `validateAircraft(spec)` must return `[]`: every number covered by provenance, every `sourced` entry has a source, and no surface is driven by throttle.
6. **Envelope tests.** Copy the PA-18's flight-envelope tests with bands taken from the new aircraft's real numbers (stall speed from wing loading, glide ratio, roll rate, static thrust). Tune `estimated` values until they pass, and mark what you tuned (ADR-0004).
7. **Wire it in.** `FlightApp` currently hard-codes `pa18`. A second aircraft needs a selector. Transmitter settings are already stored per aircraft id.
