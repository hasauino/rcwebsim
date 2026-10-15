# Airfoil polars are generated offline with XFoil and committed as tables

Section lift, drag and moment come from JSON tables in `src/sim/data/`. They hold 1° steps from −180° to 180° at several Reynolds numbers and are produced by `scripts/gen_polars.py`:

- **Attached and near-stall flow:** XFoil, run through xfoil-python.
- **Lift and drag beyond the converged range:** Viterna–Corrigan extension.
- **Moment beyond the converged range:** a flat-plate centre-of-pressure model.

At runtime the tables are looked up bilinearly in angle of attack and log(Re). Running XFoil live is impossible in a browser, and the full ±180° range is what lets spins, knife-edge flight and tail-slides behave.

## Consequences

- **Stall point:** the generator takes the _first_ lift peak. XFoil re-converges onto a spurious second peak deep in the stall.
- **Tail airfoil:** tail surfaces use a symmetric NACA 0009. A cambered tail made the plane untrimmable and yawed it at zero sideslip.
- **Low-Re data:** XFoil below about Re 50k is noisy, so those tables start at 40–60k.
