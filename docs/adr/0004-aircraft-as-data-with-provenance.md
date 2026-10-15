# Aircraft are data with per-value provenance, tuned against flight-envelope tests

An aircraft is a typed `AircraftSpec` file. Every number in it is covered by a `provenance` entry with a basis:

- **sourced:** comes from a manual or measurement and must name its source.
- **derived:** calculated from other values, or measured from the 3D model.
- **estimated:** an educated guess.
- **tuned:** adjusted until the plane matches a measurable target.

`validateAircraft` enforces this. Published data for a foam RC Cub is thin, so the estimated values are tuned until the simulation hits targets you can measure: ground attitude, static thrust, glide, cruise, stall speed, roll rate, stability, takeoff. The tests in `src/sim/simulation.test.ts` encode those targets.

## Consequences

The test bands are the specification of how the plane flies. When a change breaks one, fix the model or the parameter and mark it `tuned` with a reason. Widening a band needs a real-world justification, written as a comment next to the band.
