# Strip theory with a lagged per-surface induced angle

Each lifting surface is cut into spanwise strips. Every strip sees its own local flow: body rates, prop wash, wing downwash and sideslip with the spanwise component removed. Finite-span effects come from one induced angle per surface, CL / (π e AR), using the _previous_ step's surface CL and reduced by ground effect. Downwash at the tail is lagged by the transport time over the tail arm.

A lifting-line or vortex-lattice solve would be more exact. It would also cost an iteration or a matrix solve every step, while the lagged loop converges on its own at 500 Hz (gain ≈ 0.33) and gives induced drag and α-dot damping almost for free.

## Considered options

- **Lifting line / VLM.** Rejected for per-step cost.
- **Plain strip theory without an induced angle.** Rejected: it overpredicts lift slope and has no induced drag.
