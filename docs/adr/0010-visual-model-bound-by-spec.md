# The visual model is bound by the aircraft spec; physics geometry is measured from it

The glTF model is placed in the body frame by `spec.model`, which holds its scale, rotation, offset and the node names to animate. The physics geometry (gear contact points, tail surfaces, prop hub, collision boxes) was measured from the model's vertices, so the visual and the physics agree: the wheels touch the runway.

There is no stand-in model built in code. If the glTF fails to load, the aerodynamic debug overlay stands in, with a notice.

## Consequences

- **Moving parts:** helijah's PA-18 export is merged per material. `scripts/split-model.ts` splits the propeller and each control surface into its own node, with its origin on the hinge line and its local +X along the hinge, cutting the fin skin to free the rudder. The untouched export is kept in `models-src/` and the split model is what ships. Vertices are re-expressed, never moved, so the measured geometry still holds. A blur disc replaces the blades at high rpm.
- **Swapping the model:** re-measure the geometry, or the wheels will float or sink.
