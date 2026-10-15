# Adding or changing an aircraft

An aircraft is one `AircraftSpec` file in `src/sim/aircraft/`. `pa18.ts` is the worked example, and its `provenance` notes show what is sourced, derived, estimated and tuned.

1. **Gather sources.** Collect the manual's span, wing area, flying weight, CG, throws, motor, ESC, battery and prop, and record each as `sourced` with a link. Look up the airfoil coordinates in the UIUC database.
2. **Polars.** If the airfoil has no table in `src/sim/data/`, generate one with `scripts/gen_polars.py` (see the README), add it to `AirfoilId` and register it in `airfoil.ts`. Tail surfaces get a symmetric section.
3. **Geometry from the visual model.**
   - Measure the glTF's vertices (wing leading edge, chord, wheel contact points, tail surfaces, spinner) and scale the model to the real span.
   - Set `model.scale`, `rotationDeg` and `offset` so its wing root leading edge lands on the datum, nose to −z, right wing to +x.
   - Derive the gear, tail, prop position and collision boxes from those measurements, so the wheels touch the ground (ADR-0010).
   - Check that no collision box reaches below the wheel contact plane at the ground attitude; a box that does crashes the plane while it sits still.
4. **Animated parts.** List glTF node names and hinge axes in `model.nodes` (keys like `aileron.left`, matching telemetry `deflections`). This only works when the export has each surface as its own node, with its pivot on the hinge line.
5. **Validate.** `validateAircraft(spec)` must return `[]`: every number covered by provenance, every `sourced` entry has a source, and no surface is driven by throttle.
6. **Envelope tests.** Copy the PA-18's flight-envelope tests with bands taken from the new aircraft's real numbers (stall speed from wing loading, glide ratio, roll rate, static thrust). Tune `estimated` values until they pass, and mark what you tuned (ADR-0004).
7. **Wire it in.** `FlightApp` currently hard-codes `pa18`. A second aircraft needs a selector. Transmitter settings are already stored per aircraft id.
