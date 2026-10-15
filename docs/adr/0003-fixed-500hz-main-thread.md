# Fixed 500 Hz step on the main thread; the sim core stays DOM-free

The simulation runs at a fixed 1/500 s step on the main thread. `FixedStepRunner` keeps an accumulator, caps steps per frame (dropping the backlog if a frame runs long), and interpolates the render pose between physics states.

500 Hz keeps the stiff parts stable: gear springs, prop shaft dynamics and the lagged induced-angle loop. The whole step costs well under a millisecond, so a Web Worker (which needs SharedArrayBuffer and cross-origin isolation headers, both awkward on GitHub Pages) isn't worth it yet.

## Consequences

Nothing under `src/sim/` may touch the DOM, `window`, Vue or the renderer. That rule is what lets the sim run headless in Vitest, and it's what would let it move to a worker later.
