# WebGPURenderer with TSL materials

Rendering uses `three/webgpu`'s `WebGPURenderer`, which falls back to WebGL 2 by itself. Materials are node materials written in TSL. This is where three.js is heading, and it gives headroom for grass and shadows.

## Consequences

- **APIs:** WebGL-only APIs don't apply. `PCFSoftShadowMap` doesn't exist here (use `PCFShadowMap`), and shadows use `CSMShadowNode`. Write materials as `*NodeMaterial` with TSL rather than `onBeforeCompile`.
- **Imports:** import core classes from `three` and renderer/node classes from `three/webgpu`. Both builds share `three.core.js`, so classes stay identical.
