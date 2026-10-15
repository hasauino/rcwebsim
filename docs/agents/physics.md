# Physics: conventions, step order, diagnosing and tuning

Read before changing anything in `src/sim/` or an aircraft spec. Terms are defined in `GLOSSARY.md`.

## Frames and signs

| Thing      | Convention                                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| World      | +x east, +y up, +z south (north is −z). Runway runs east–west through the origin.                                                                                              |
| Body       | +x right wing, +y up, +z tail-ward (the nose points −z). Same as three.js cameras.                                                                                             |
| Origin     | The datum (wing root leading edge, centreline). The CG is an offset from it.                                                                                                   |
| Units      | SI. Angles are degrees in specs and telemetry, radians inside the maths.                                                                                                       |
| Heading    | Degrees true: 0 north, 90 east. Wind `fromDeg` is where it blows _from_.                                                                                                       |
| Channels   | Surfaces −1..1, throttle and flap 0..1. Elevator +1 = stick pulled back = nose up. Rudder +1 = nose right. Aileron +1 = roll right.                                            |
| Deflection | Positive = trailing edge towards the surface's −normal (down on wings, right on the fin), which raises lift along +normal. Each half's `gain` maps channel to deflection.      |
| Rates      | Body rotation is about +x (pitch), +y (yaw), +z (roll). Telemetry flips signs so that positive is roll right, pitch up and yaw right.                                          |
| Span axis  | Each strip's `span = forward × normal` points to the aircraft's right on both wing halves. Mirrored halves recompute it, so the lift direction is right without special cases. |
| Prop       | `clockwiseFromBehind` → spin vector along +thrust axis. Torque reaction rolls the airframe left. The slipstream swirls the same way as the prop.                               |

## Order of one step (`Simulation.step`)

1. Read the body state from Rapier, then update the wind and gusts at the CG height.
2. Turn the CoM velocity relative to the air, and the body rates, into the body frame.
3. Receiver channels → flight controller → servos (rate-limited).
4. Propulsion (battery → ESC → motor → blade-element prop). Gives force and moment at the hub, plus the slipstream state.
5. Aerodynamics: strips, then bluff bodies. Uses the slipstream and the previous step's surface CL and downwash.
6. Gear raycasts against the analytic terrain.
7. Sum everything into one force and torque about the CoM, then `world.step()`, then the crash impulse check.

Rapier already integrates the rigid body's gyroscopic term. Only the prop's angular momentum is added by hand (ADR-0001).

## Diagnosing a flight-behaviour problem

1. **Reproduce headless.** Write a throwaway `src/sim/dbg.test.ts` that drives `createSimulation` with the inputs, prints telemetry every N steps, and runs with `npx vitest run src/sim/dbg.test.ts --silent=false`. Delete it before committing.
2. **Break the problem into moments or forces.** `sim.strips()` gives each strip's `force`, `alpha`, `stalled` and `inSlipstream` in the body frame. Sum `(position − cg) × force` per surface to see which part drives a pitch, roll or yaw. Private internals (`aero.moment`, `propulsion.output`) can be read through `(sim as any)` _in throwaway debug code only_.
3. **Fix the physical cause, then re-run the whole suite.** Every geometry or tuning change has moved several envelope tests at once in the past.

Root causes found so far, worth checking first:

- **Cambered tail surfaces** made the plane untrimmable and gave yaw at zero sideslip. Tails use NACA 0009.
- **Thrust line versus CG height** controls the pitch change with power.
- **Stabiliser incidence relative to the thrust line** decides whether the slipstream lifts the tail on the ground, which causes nose-overs.
- **Slipstream on the wing root** gives lift at a standstill. The spec field `slipstreamExposure` accounts for the cabin roof blocking the flow under the root.
- **Swirl hitting the fin** drives ground loops at full power. `SWIRL_RECOVERY` stands in for the fuselage straightening the flow.
- **Contact force at 500 Hz is huge for small bumps,** so crashes use impulse (ADR-0007).

## Balance

`sim/balance.ts` finds the stick-fixed, power-off neutral point by running the strip aerodynamics at two angles of attack. It is not a separate formula, so it follows every geometry change. The PA-18's sits at about 113 mm (46% MAC), which gives a 12% static margin at the manual's 82 mm. `Simulation.setCg` moves the CG fore and aft only, keeping mass and inertia. Behind the neutral point the plane still settles near the stall at about 14° angle of attack: that is stall-stability from the flattening lift curve, not a bug.

## Tuning a parameter

Only values whose provenance basis is `estimated` or `tuned` may be tuned. Change the value, re-run `npm test`, then set the provenance basis to `tuned` with a note naming the target it hits. `sourced` values only change with a better source (ADR-0004).

## Test pilots

Envelope tests fly the plane with small P/PD "test pilots" (`wingsLevel`, `holdAltitude`, the takeoff pilot). If a test fails right after a dynamics change, check whether the pilot's technique is still sensible before suspecting the model. A fixed elevator step at full power will loop the plane; a pitch-attitude target will not.
