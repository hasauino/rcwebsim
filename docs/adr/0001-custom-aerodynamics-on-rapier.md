# Rapier integrates and collides; aerodynamics, propulsion and gear are our own

Rapier only moves the rigid body (including its gyroscopic terms) and detects airframe collisions. Every aerodynamic, propeller and landing-gear force is computed in `src/sim/` and applied as one force and torque about the centre of mass per 500 Hz step. No physics library models RC-scale aerodynamics, and keeping the force models ours keeps them testable and tunable.

## Considered options

- **A fully custom 6-DOF integrator.** Rejected: it would also mean writing collision handling, and Rapier is deterministic and fast.
- **cannon-es or Ammo.js.** Rejected: slower and less maintained.
- **Rapier wheel/contact physics for the gear.** Rejected: raycast springs behave far better for small wheels at 500 Hz (see ADR-0002).

## Consequences

Do not add the rigid body's own gyroscopic term (ω × Iω) yourself. Rapier already integrates it. Only the propeller's angular momentum is added by hand.
