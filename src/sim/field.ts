import { Rng } from './rng'

/**
 * The club flying field, shared by physics and rendering. World frame:
 * +x east, +y up, +z south. The runway runs east-west through the origin and
 * the pilot station stands south of it.
 */
export const FIELD = {
  /** Terrain square side, m. */
  size: 2000,
  /** Height samples per side (cells = resolution - 1). */
  resolution: 513,
  /** Perfectly flat mown/grass area radius, m. */
  flatRadius: 320,
  /** Hill ramp ends here. */
  hillRadius: 750,
  hillHeight: 45,
  runway: { length: 120, width: 14 },
  /** Pilot's eye position. */
  pilotStation: { x: 0, y: 1.7, z: 16 },
  fence: { z: 11, halfLength: 40 },
  /** Where a runway spawn puts the main wheels, heading east into the wind. */
  runwayStart: { x: -48, z: 0, headingDeg: 90 },
} as const

export interface Tree {
  x: number
  z: number
  height: number
  trunkRadius: number
  canopyRadius: number
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Ground height at a world position. Flat around the runway, hills beyond. */
export function terrainHeight(x: number, z: number): number {
  const r = Math.hypot(x, z)
  const ramp = smoothstep(FIELD.flatRadius, FIELD.hillRadius, r)
  if (ramp === 0) return 0
  const n =
    0.5 * Math.sin(x * 0.0061 + 1.3) * Math.cos(z * 0.0053 - 0.4) +
    0.3 * Math.sin(x * 0.013 - z * 0.011 + 2.1) +
    0.2 * Math.cos(x * 0.027 + z * 0.023)
  return ramp * FIELD.hillHeight * (0.55 + 0.45 * n)
}

/** Tree lines bordering the field plus scattered clumps. Deterministic. */
export function treeLayout(seed = 7): Tree[] {
  const rng = new Rng(seed)
  const trees: Tree[] = []
  const add = (x: number, z: number) => {
    const height = rng.range(9, 18)
    trees.push({
      x,
      z,
      height,
      trunkRadius: rng.range(0.2, 0.35),
      canopyRadius: height * rng.range(0.22, 0.3),
    })
  }
  // North and south tree lines, a western windbreak, sparse clumps east.
  for (let x = -260; x <= 260; x += rng.range(9, 16)) add(x, -190 + rng.range(-6, 6))
  for (let x = -260; x <= 120; x += rng.range(10, 18)) add(x, 150 + rng.range(-6, 6))
  for (let z = -170; z <= 130; z += rng.range(10, 16)) add(-280 + rng.range(-5, 5), z)
  for (let i = 0; i < 40; i++) {
    const a = rng.range(0, Math.PI * 2)
    const r = rng.range(340, 700)
    add(Math.cos(a) * r, Math.sin(a) * r)
  }
  return trees
}

export interface GroundHit {
  /** Distance along the ray; negative when the origin is already underground. */
  distance: number
  normal: { x: number; y: number; z: number }
}

/**
 * Intersects a ray with the analytic terrain. Exact on the flat field, unlike
 * a triangulated heightfield, and never "misses" from just below the surface.
 */
export function terrainRaycast(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDistance: number,
): GroundHit | null {
  const gap = (t: number) => oy + dy * t - terrainHeight(ox + dx * t, oz + dz * t)
  let distance: number
  const g0 = gap(0)
  if (g0 <= 0) {
    distance = dy < 0 ? g0 / -dy : 0
  } else {
    if (gap(maxDistance) > 0) return null
    let lo = 0
    let hi = maxDistance
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2
      if (gap(mid) > 0) lo = mid
      else hi = mid
    }
    distance = (lo + hi) / 2
  }
  const x = ox + dx * distance
  const z = oz + dz * distance
  const e = 0.05
  const sx = (terrainHeight(x + e, z) - terrainHeight(x - e, z)) / (2 * e)
  const sz = (terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e)
  const len = Math.hypot(sx, 1, sz)
  return { distance, normal: { x: -sx / len, y: 1 / len, z: -sz / len } }
}
