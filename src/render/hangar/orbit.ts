export type Vec3 = readonly [number, number, number]

/** An axis-aligned box: the inside of the room. */
export interface Box {
  min: Vec3
  max: Vec3
}

/**
 * How far the orbit camera can sit from `target` along unit `dir` and stay
 * `margin` inside every wall, the floor and the ceiling.
 */
export function orbitReach(target: Vec3, dir: Vec3, room: Box, margin: number): number {
  let reach = Infinity
  for (let i = 0; i < 3; i++) {
    const d = dir[i]!
    if (d === 0) continue
    const wall = d > 0 ? room.max[i]! - margin : room.min[i]! + margin
    reach = Math.min(reach, (wall - target[i]!) / d)
  }
  return Math.max(0, reach)
}
