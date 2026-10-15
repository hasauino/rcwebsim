# AGENTS.md

A browser RC flight simulator. The physics is the product: the PA-18 must fly like the real 1.7 m foam Cub. Use the domain words in `GLOSSARY.md` in code, tests and docs.

## Rules

- **The sim core is DOM-free.** Nothing under `src/sim/` touches `window`, the DOM, Vue or the renderer (ADR-0003).
- **The sim is deterministic.** Randomness inside `src/sim/` goes through the seeded `Rng`; never wall-clock or frame time. Any change to sim state made outside `step()` is recorded like `FlightRecorder.setWind` (ADR-0008).
- **The flight-envelope tests are the spec.** When one fails, fix the model or tune an `estimated` value and mark it `tuned` with the target it hits. A band moves only with real-world evidence, cited next to it (ADR-0004).
- **Every aircraft number carries provenance.** `validateAircraft` enforces it.
- **Test through the public seams with TDD:** `createSimulation`/`Simulation`, `validateAircraft`, `FlightRecorder`/`replay`, `balance`/`neutralPoint` for the CG, and `InputDevices` for the touch sticks, gamepads and USB radios.
- **Vue holds snapshots only.** Three objects and per-step state stay out of reactive stores (ADR-0009).
- **Load runtime assets with relative URLs** (`assets/…`, `models/…`). The site is served from a subpath.
- **The pre-commit hook runs lint-staged, typecheck and tests.** Commit through it.

## Read before you start

- **Physics or aircraft-spec work:** `docs/agents/physics.md` covers frames, sign conventions, step order, and how to diagnose and tune flight behaviour.
- **Adding or re-measuring an aircraft or its 3D model:** `docs/agents/adding-an-aircraft.md`.
- **Checking UI, rendering, input or audio in a real browser, or deploying:** `docs/agents/verification.md`.
- **Planning features or judging scope:** `docs/agents/context.md` covers the agreed v1 scope, current state and open work.
- **Questioning why something is built the way it is:** `docs/adr/`.
- **Issues and specs:** `docs/agents/issue-tracker.md`.
