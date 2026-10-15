export type Rapier = typeof import('@dimforge/rapier3d-compat').default

let ready: Promise<Rapier> | undefined

/** Loads the Rapier WASM module once (as its own chunk: it is ~2 MB). */
export function loadPhysics(): Promise<Rapier> {
  ready ??= import('@dimforge/rapier3d-compat').then(async ({ default: rapier }) => {
    await rapier.init()
    return rapier
  })
  return ready
}
