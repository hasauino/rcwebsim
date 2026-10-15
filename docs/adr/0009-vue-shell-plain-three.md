# Vue owns only the UI shell; three.js and the sim are plain TypeScript

Vue 3 and Pinia render the HUD, settings and overlays. The scene, the sim and input live in plain TypeScript classes. `FlightApp` mounts them once and pushes a telemetry snapshot into Pinia at about 15 Hz.

TresJS (declarative three.js in Vue) was rejected. The 500 Hz loop needs exact control over the order of work each frame, and pushing per-frame state through Vue's reactivity would cost time and hide that order.

## Consequences

Keep Three objects and per-step state out of reactive stores. Use `shallowRef` snapshots.
