import type { WalkKeys } from '../input/devices'
import { FIELD, terrainHeight, type Tree } from '../sim/field'
import type { Vec3Like } from '../sim/simulation'

/** Brisk walking pace, m/s. */
const WALK_SPEED = 1.4
/** Jogging pace, m/s. */
const RUN_SPEED = 4
/** Eye above the ground; the pilot station is on flat ground. */
const EYE_HEIGHT = FIELD.pilotStation.y
/** The pilot's half-width, m, for keeping clear of tree trunks. */
const BODY_RADIUS = 0.3
/** How far from the centre the pilot may walk, m: short of the terrain's edge. */
const LIMIT = FIELD.size / 2 - 50

/**
 * The pilot on foot. They fly from the pilot station but can walk the field
 * to watch from somewhere else; the pilot view looks out from their eyes.
 * Not sim state: where the pilot stands changes the flight only through
 * a hand launch, which records the spot it was thrown from.
 */
export class Pilot {
  /** Eye position, world frame. */
  readonly eye: Vec3Like = { ...FIELD.pilotStation }
  /** Unit heading the pilot walks by; held while they look straight up. */
  private readonly heading = { x: 0, z: -1 }

  constructor(private readonly trees: Tree[]) {}

  /**
   * Walks for `dt` seconds. `facing` is the horizontal direction the pilot
   * looks (any length): ahead is that way, right is to its right.
   */
  walk(dt: number, keys: WalkKeys, facing: { x: number; z: number }): void {
    const len = Math.hypot(facing.x, facing.z)
    if (len > 1e-6) {
      this.heading.x = facing.x / len
      this.heading.z = facing.z / len
    }
    const { x: fx, z: fz } = this.heading
    // Diagonals are no faster than straight lines.
    const push = Math.max(1, Math.hypot(keys.forward, keys.right))
    const step = ((keys.running ? RUN_SPEED : WALK_SPEED) * dt) / push
    this.eye.x += (fx * keys.forward - fz * keys.right) * step
    this.eye.z += (fz * keys.forward + fx * keys.right) * step
    // Trunks push the pilot back out, so they slip round one they meet off-centre.
    for (const tree of this.trees) {
      const dx = this.eye.x - tree.x
      const dz = this.eye.z - tree.z
      const clear = tree.trunkRadius + BODY_RADIUS
      const d = Math.hypot(dx, dz)
      if (d >= clear || d === 0) continue
      this.eye.x = tree.x + (dx / d) * clear
      this.eye.z = tree.z + (dz / d) * clear
    }
    this.eye.x = Math.max(-LIMIT, Math.min(LIMIT, this.eye.x))
    this.eye.z = Math.max(-LIMIT, Math.min(LIMIT, this.eye.z))
    this.eye.y = terrainHeight(this.eye.x, this.eye.z) + EYE_HEIGHT
  }

  returnToStation(): void {
    Object.assign(this.eye, FIELD.pilotStation)
  }
}
