# Landing gear raycasts the analytic terrain, not Rapier's heightfield

The wheels intersect `terrainHeight()` directly (`terrainRaycast` in `src/sim/field.ts`). Rapier's heightfield exists only so the airframe boxes can hit the ground.

Rapier's heightfield ray cast misses rays that run along a triangle edge. The runway centreline sits exactly on a cell boundary, so the tailwheel kept falling through. The analytic cast is also exact on the flat field. When a ray starts below the surface it returns a negative distance, which gives a strong bump-stop force instead of a miss.

## Consequences

Terrain features the wheels must feel (bumps, hills) have to be expressed in `terrainHeight()`. On hills, the coarse heightfield and the analytic surface can differ by a few centimetres.
