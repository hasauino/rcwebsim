# The simulation is deterministic; a flight is its start conditions plus inputs

Given the same aircraft, seed, wind, spawn and per-step inputs, the sim reproduces a flight bit-for-bit on the same machine. All randomness goes through the seeded `Rng`; Dryden turbulence is driven by it. A `FlightRecording` therefore stores only the start conditions, run-length-encoded inputs, and any mid-flight wind changes. That is enough for regression tests and replays.

## Consequences

- **Randomness:** never use `Math.random()`, wall-clock time or frame time inside `src/sim/`.
- **Mid-flight changes:** any change to sim state made outside `step()` must be recorded the way `FlightRecorder.setWind` records wind, or replays will diverge.
