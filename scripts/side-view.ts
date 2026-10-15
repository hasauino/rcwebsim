/**
 * Traces an aircraft's side silhouette from its glTF model, in body-frame
 * millimetres, for the Balance settings tab. The model is placed exactly as
 * the renderer places it (the spec's model binding), every triangle is
 * projected onto the side plane and rasterised, and the outline is traced
 * with marching squares and simplified.
 *
 * Set AIRCRAFT and OUTPUT below for another aircraft.
 *
 * Usage (Node 22.18+ runs TypeScript directly):
 *     node scripts/side-view.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { pa18 } from '../src/sim/aircraft/pa18.ts'

const AIRCRAFT = pa18
const OUTPUT = 'src/ui/side-views/pa18.json'
/** Raster cell, mm. */
const CELL = 1
/** Outline simplification tolerance, mm. */
const TOLERANCE = 0.7

interface Gltf {
  scene: number
  scenes: { nodes: number[] }[]
  nodes: { matrix?: number[]; children?: number[]; mesh?: number }[]
  meshes: { primitives: { attributes: { POSITION: number }; indices?: number }[] }[]
  accessors: { bufferView: number; byteOffset?: number; count: number; componentType: number }[]
  bufferViews: { byteOffset?: number; byteStride?: number }[]
  buffers: { uri: string }[]
}

const modelPath = `public/${AIRCRAFT.model.url}`
const gltf = JSON.parse(readFileSync(modelPath, 'utf8')) as Gltf
const bin = readFileSync(new URL(gltf.buffers[0]!.uri, `file://${process.cwd()}/${modelPath}`))

function read(accessorIndex: number): Float32Array | Uint32Array | Uint16Array {
  const a = gltf.accessors[accessorIndex]!
  const view = gltf.bufferViews[a.bufferView]!
  if (view.byteStride && view.byteStride !== 12)
    throw new Error(`accessor ${accessorIndex}: interleaved buffers are not supported`)
  const offset = bin.byteOffset + (view.byteOffset ?? 0) + (a.byteOffset ?? 0)
  // Copy out so typed arrays get an aligned buffer. Positions are VEC3.
  if (a.componentType === 5126)
    return new Float32Array(bin.buffer.slice(offset, offset + a.count * 12))
  if (a.componentType === 5125)
    return new Uint32Array(bin.buffer.slice(offset, offset + a.count * 4))
  return new Uint16Array(bin.buffer.slice(offset, offset + a.count * 2))
}

// Same transform as render/aircraft.ts: binding root (scale, XYZ Euler,
// offset) around the glTF scene's node hierarchy.
const { scale, rotationDeg, offset } = AIRCRAFT.model
const binding = new Matrix4().compose(
  new Vector3(...offset),
  new Quaternion().setFromEuler(
    new Euler(...(rotationDeg.map((d) => (d * Math.PI) / 180) as [number, number, number])),
  ),
  new Vector3(scale, scale, scale),
)

/** Side-projected triangles: [z, y] in mm, three vertices each. */
const triangles: number[][] = []
const p = new Vector3()
function visit(nodeIndex: number, parent: Matrix4) {
  const node = gltf.nodes[nodeIndex]!
  const world = node.matrix ? parent.clone().multiply(new Matrix4().fromArray(node.matrix)) : parent
  if (node.mesh !== undefined) {
    for (const prim of gltf.meshes[node.mesh]!.primitives) {
      const pos = read(prim.attributes.POSITION) as Float32Array
      const idx = prim.indices !== undefined ? read(prim.indices) : null
      const count = idx ? idx.length : pos.length / 3
      for (let i = 0; i < count; i += 3) {
        const tri: number[] = []
        for (let k = 0; k < 3; k++) {
          const v = idx ? idx[i + k]! : i + k
          p.set(pos[v * 3]!, pos[v * 3 + 1]!, pos[v * 3 + 2]!).applyMatrix4(world)
          tri.push(p.z * 1000, p.y * 1000)
        }
        triangles.push(tri)
      }
    }
  }
  for (const child of node.children ?? []) visit(child, world)
}
for (const n of gltf.scenes[gltf.scene]!.nodes) visit(n, binding)

// Raster grid over the bounds, with an empty border for marching squares.
let minZ = Infinity
let maxZ = -Infinity
let minY = Infinity
let maxY = -Infinity
for (const t of triangles) {
  for (let k = 0; k < 6; k += 2) {
    minZ = Math.min(minZ, t[k]!)
    maxZ = Math.max(maxZ, t[k]!)
    minY = Math.min(minY, t[k + 1]!)
    maxY = Math.max(maxY, t[k + 1]!)
  }
}
const z0 = Math.floor(minZ) - 2 * CELL
const y0 = Math.floor(minY) - 2 * CELL
const cols = Math.ceil((maxZ - z0) / CELL) + 3
const rows = Math.ceil((maxY - y0) / CELL) + 3
const filled = new Uint8Array(cols * rows)

for (const [az, ay, bz, by, cz, cy] of triangles as [
  number,
  number,
  number,
  number,
  number,
  number,
][]) {
  const area = (bz - az) * (cy - ay) - (cz - az) * (by - ay)
  if (Math.abs(area) < 1e-9) continue
  const c0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - z0) / CELL))
  const c1 = Math.min(cols - 1, Math.ceil((Math.max(az, bz, cz) - z0) / CELL))
  const r0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - y0) / CELL))
  const r1 = Math.min(rows - 1, Math.ceil((Math.max(ay, by, cy) - y0) / CELL))
  for (let r = r0; r <= r1; r++) {
    const y = y0 + (r + 0.5) * CELL
    for (let c = c0; c <= c1; c++) {
      const z = z0 + (c + 0.5) * CELL
      const w0 = ((bz - z) * (cy - y) - (cz - z) * (by - y)) / area
      const w1 = ((cz - z) * (ay - y) - (az - z) * (cy - y)) / area
      if (w0 >= 0 && w1 >= 0 && w0 + w1 <= 1) filled[r * cols + c] = 1
    }
  }
}

// Marching squares over cell centres: segment ends sit on cell-edge
// midpoints, keyed on a doubled integer grid so chains join exactly.
const at = (c: number, r: number) => filled[r * cols + c]!
const segments = new Map<string, string[]>()
const link = (a: string, b: string) => {
  segments.set(a, [...(segments.get(a) ?? []), b])
  segments.set(b, [...(segments.get(b) ?? []), a])
}
for (let r = 0; r < rows - 1; r++) {
  for (let c = 0; c < cols - 1; c++) {
    const code = at(c, r) | (at(c + 1, r) << 1) | (at(c + 1, r + 1) << 2) | (at(c, r + 1) << 3)
    if (code === 0 || code === 15) continue
    const bottom = `${2 * c + 1},${2 * r}`
    const right = `${2 * c + 2},${2 * r + 1}`
    const top = `${2 * c + 1},${2 * r + 2}`
    const left = `${2 * c},${2 * r + 1}`
    const edges: Record<number, [string, string][]> = {
      1: [[left, bottom]],
      2: [[bottom, right]],
      3: [[left, right]],
      4: [[right, top]],
      5: [
        [left, top],
        [bottom, right],
      ],
      6: [[bottom, top]],
      7: [[left, top]],
      8: [[top, left]],
      9: [[top, bottom]],
      10: [
        [left, bottom],
        [top, right],
      ],
      11: [[top, right]],
      12: [[right, left]],
      13: [[right, bottom]],
      14: [[bottom, left]],
    }
    for (const [a, b] of edges[code]!) link(a, b)
  }
}

const loops: [number, number][][] = []
const visited = new Set<string>()
for (const start of segments.keys()) {
  if (visited.has(start)) continue
  const loop: string[] = []
  let previous = ''
  let current = start
  while (!visited.has(current)) {
    visited.add(current)
    loop.push(current)
    const next = segments.get(current)!.find((n) => n !== previous && !visited.has(n))
    if (!next) break
    previous = current
    current = next
  }
  if (loop.length < 8) continue
  loops.push(
    loop.map((key) => {
      const [gc, gr] = key.split(',').map(Number) as [number, number]
      return [z0 + (gc / 2 + 0.5) * CELL, y0 + (gr / 2 + 0.5) * CELL]
    }),
  )
}

function simplify(points: [number, number][], tolerance: number): [number, number][] {
  if (points.length < 3) return points
  const [a, b] = [points[0]!, points[points.length - 1]!]
  let worst = 0
  let index = 0
  for (let i = 1; i < points.length - 1; i++) {
    const [pz, py] = points[i]!
    const dz = b[0] - a[0]
    const dy = b[1] - a[1]
    const length = Math.hypot(dz, dy)
    const distance =
      length === 0
        ? Math.hypot(pz - a[0], py - a[1])
        : Math.abs(dz * (a[1] - py) - (a[0] - pz) * dy) / length
    if (distance > worst) {
      worst = distance
      index = i
    }
  }
  if (worst <= tolerance) return [a, b]
  const left = simplify(points.slice(0, index + 1), tolerance)
  return [...left.slice(0, -1), ...simplify(points.slice(index), tolerance)]
}

/** Closed loop: split at the point farthest from the first, simplify both halves. */
function simplifyLoop(loop: [number, number][]): [number, number][] {
  const [sz, sy] = loop[0]!
  let far = 0
  loop.forEach(([z, y], i) => {
    if (Math.hypot(z - sz, y - sy) > Math.hypot(loop[far]![0] - sz, loop[far]![1] - sy)) far = i
  })
  const first = simplify(loop.slice(0, far + 1), TOLERANCE)
  const second = simplify([...loop.slice(far), loop[0]!], TOLERANCE)
  return [...first.slice(0, -1), ...second.slice(0, -1)]
}

const round = (v: number) => Math.round(v * 10) / 10
// SVG y points down, body y points up.
const path = loops
  .map(simplifyLoop)
  .filter((loop) => loop.length >= 3)
  .map((loop) => `M${loop.map(([z, y]) => `${round(z)} ${round(-y)}`).join('L')}Z`)
  .join('')

const sideView = {
  generatedBy: 'scripts/side-view.ts',
  source: modelPath,
  units: 'mm, body frame: x = behind the datum, y = below the datum',
  bounds: {
    x: Math.floor(minZ),
    y: Math.floor(-maxY),
    width: Math.ceil(maxZ - minZ),
    height: Math.ceil(maxY - minY),
  },
  path,
}
writeFileSync(OUTPUT, `${JSON.stringify(sideView, null, 2)}\n`)
console.log(`${OUTPUT}: ${loops.length} outlines, ${path.length} chars`)
