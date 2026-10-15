import RAPIER from '@dimforge/rapier3d-compat'

export type Rapier = typeof RAPIER

let ready: Promise<Rapier> | undefined

/** Loads the Rapier WASM module once. */
export function loadPhysics(): Promise<Rapier> {
  ready ??= RAPIER.init().then(() => RAPIER)
  return ready
}
