# The visual model is bound by the aircraft spec; physics geometry is measured from it

The glTF model is placed in the body frame by `spec.model`, which holds its scale, rotation, offset and the node names to animate. The physics geometry (gear contact points, tail surfaces, prop hub, collision boxes) was measured from the model's vertices, so the visual and the physics agree: the wheels touch the runway.

There is no stand-in model built in code. If the glTF fails to load, the aerodynamic debug overlay stands in, with a notice.

## Consequences

- **Moving parts:** helijah's PA-18 export is merged per material, with no separate control surfaces and no propeller blades. A prop blur disc is drawn instead, and surfaces only animate once the model is split in Blender and the nodes are listed in `model.nodes`.
- **Swapping the model:** re-measure the geometry, or the wheels will float or sink.
