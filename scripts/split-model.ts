/**
 * Splits the moving parts out of an aircraft's glTF export into their own
 * nodes, so the renderer can animate them (ADR-0010). The source export
 * merges everything per material; this pulls the propeller and each control
 * surface's triangles into a node whose origin is on the hinge line (or prop
 * hub) and whose local +X is the hinge (or spin) axis. Where a surface has no
 * seam in the mesh, triangles are cut along a plane first.
 *
 * Hinge axes point so that a right-handed turn about local +X moves the
 * trailing edge towards the surface's -normal (down on wings and stabiliser,
 * right on the fin), so every binding in the spec is `hingeAxis: [1, 0, 0]`.
 * The spin axis points along the thrust line.
 *
 * Vertices are only re-expressed in the new frames, never moved, so the
 * physics geometry measured from the model stays valid.
 *
 * Node names avoid "." and other characters three.js strips from names.
 *
 * Each aircraft's SOURCE, OUTPUT, PARENT and PARTS are in MODELS below.
 * Coordinates are in the export's own frame under PARENT. Images the export
 * references are copied next to the output.
 *
 * Usage (Node 22.18+ runs TypeScript directly):
 *     node scripts/split-model.ts pa18
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { Quaternion, Vector3 } from 'three'

type V3 = [number, number, number]
type Axis = 0 | 1 | 2

interface Box {
  min: V3
  max: V3
}

/** Triangles of one source mesh node that lie wholly inside `box`. */
interface Take {
  from: string
  box: Box
  /**
   * Take whole connected pieces of the mesh whose bounds lie in `box`, where
   * a box alone can't tell neighbouring pieces apart.
   */
  pieces?: boolean
  /** Cut the candidates crossing this plane first; `box` then picks a side. */
  cut?: { axis: Axis; at: number }
}

type Pivot =
  /**
   * Spins about `spin` through the centre of the part's bounds, or through
   * `hub` (the centre of the blades' disc) where that differs.
   */
  | { spin: V3; hub?: V3 }
  /**
   * Hinges on the line through the bounds centres of the part's vertices
   * inside `line`, taken on each half of their extent along `along`.
   * `trailingEdge` is the way positive deflection moves the edge farthest
   * from the hinge.
   */
  | { line: Box; along: Axis; trailingEdge: V3 }
  /**
   * Hinges on the line from the first point to the second, both measured on
   * the hinge. Positive deflection is a right-handed turn about that direction.
   */
  | { through: [V3, V3] }

interface Part {
  name: string
  take: Take[]
  /** Omitted: the part shares its parent's frame. */
  pivot?: Pivot
  children?: Part[]
}

interface Model {
  source: string
  output: string
  /** The node whose children are the export's bare mesh nodes. */
  parent: string
  parts: Part[]
}

const INF = 1e9
const ALL: Box = { min: [-INF, -INF, -INF], max: [INF, INF, INF] }

// PA-18 export frame: +x aft, +y right, +z up.
const DOWN: V3 = [0, 0, -1]
const RIGHT: V3 = [0, 1, 0]
const FORWARD: V3 = [-1, 0, 0]

/** A wing or stabiliser surface on the left (-y) side, mirrored for the right. */
function sides(
  name: string,
  from: string,
  box: Box,
  line: Box,
  { pieces, cut }: Pick<Take, 'pieces' | 'cut'> = {},
): Part[] {
  const mirror = (b: Box): Box => ({
    min: [b.min[0], -b.max[1], b.min[2]],
    max: [b.max[0], -b.min[1], b.max[2]],
  })
  const part = (side: string, b: Box, l: Box): Part => ({
    name: `${name}_${side}`,
    take: [{ from, box: b, pieces, cut }],
    pivot: { line: l, along: 1, trailingEdge: DOWN },
  })
  return [part('left', box, line), part('right', mirror(box), mirror(line))]
}

const PA18: Part[] = [
  {
    // Spinner (its own mesh) and the two blades in front of the cowling.
    name: 'propeller',
    take: [{ from: 'Object_4', box: ALL }],
    pivot: { spin: FORWARD },
    children: [
      {
        name: 'propeller_blades',
        take: [
          {
            from: 'Object_6',
            box: { min: [-3.45, -0.1, -1.05], max: [-3.3, 0.1, 0.9] },
            pieces: true,
          },
        ],
      },
    ],
  },
  // Aileron skins and their horns; hinged at the leading edge.
  ...sides(
    'aileron',
    'Object_6',
    { min: [-0.8, -4.7, 0.5], max: [-0.3, -2.0, 0.7] },
    { min: [-0.8, -4.7, 0.5], max: [-0.72, -2.0, 0.7] },
    { pieces: true },
  ),
  // The flap piece runs on behind the aileron; only its inboard part moves.
  ...sides(
    'flap',
    'Object_7',
    { min: [-0.9, -2.07, 0.4], max: [-0.3, -0.4, 0.8] },
    { min: [-0.9, -2.07, 0.4], max: [-0.74, -0.4, 0.8] },
  ),
  // One piece across the centreline in the export, cut into halves at y = 0.
  // Its leading edge overlaps the stabiliser's trailing edge, so take pieces.
  ...sides(
    'elevator',
    'Object_6',
    { min: [2.82, -1.5, 0.2], max: [3.4, 0, 0.4] },
    { min: [2.82, -1.5, 0.2], max: [2.845, -0.05, 0.4] },
    { pieces: true, cut: { axis: 1, at: 0 } },
  ),
  {
    // Fin and rudder are one skin. Cut it just ahead of the hinge post; the
    // post turns with the rudder about its own centreline.
    name: 'rudder',
    take: [
      {
        from: 'Object_7',
        box: { min: [2.88, -0.1, -0.06], max: [3.5, 0.1, 1.4] },
        cut: { axis: 0, at: 2.88 },
      },
    ],
    pivot: {
      line: { min: [2.88, -0.022, 0], max: [2.94, 0.022, 1.3] },
      along: 2,
      trailingEdge: RIGHT,
    },
  },
]

/**
 * Extra 300 export frame (scripts/extra300/export.py): +x right, +y up, +z
 * aft. Every moving part is its own mesh already; hinge points are the noses
 * of each surface's end ribs, read off the vertices.
 */
const EXTRA300: Part[] = [
  {
    // Two blades and the spinner, spinning about the thrust line (-z) on
    // the centre of the blades' disc, behind the spinner's middle.
    name: 'propeller',
    take: [{ from: 'propeller_hub', box: ALL }],
    pivot: { spin: [0, 0, -1], hub: [0, 1.060757, -0.942] },
    children: [{ name: 'propeller_blades', take: [{ from: 'propeller', box: ALL }] }],
  },
  ...(['left', 'right'] as const).map((side): Part => {
    const x = side === 'left' ? -1 : 1
    const inboard: V3 = [0.791 * x, 0.914, 1.062]
    const outboard: V3 = [3.025 * x, 0.919, 0.71]
    return {
      // The aileron and the spade hung under it, hinged left to right so the
      // trailing edge goes down.
      name: `aileron_${side}`,
      take: [
        { from: `aileron_${side[0]}`, box: ALL },
        { from: side === 'left' ? 'chassis.012' : 'chassis.013', box: ALL },
      ],
      pivot: { through: side === 'left' ? [outboard, inboard] : [inboard, outboard] },
    }
  }),
  ...(['left', 'right'] as const).map((side): Part => {
    const x = side === 'left' ? -1 : 1
    const inboard: V3 = [0.0622 * x, 1.2906, 3.5343]
    const outboard: V3 = [1.3125 * x, 1.2909, 3.5377]
    const box: Box =
      side === 'left'
        ? { min: [-INF, -INF, -INF], max: [0, INF, INF] }
        : { min: [0, -INF, -INF], max: [INF, INF, INF] }
    return {
      // One mesh, two pieces either side of the fin; hinged left to right.
      name: `elevator_${side}`,
      take: [{ from: 'elevator', box, pieces: true }],
      pivot: { through: side === 'left' ? [outboard, inboard] : [inboard, outboard] },
    }
  }),
  {
    // Vertical hinge, hinged upwards so the trailing edge goes right. The
    // horn balance above it sits ahead of the line.
    name: 'rudder',
    take: [{ from: 'rudder', box: ALL }],
    pivot: {
      through: [
        [0, 1.0131, 3.61],
        [0, 1.3298, 3.61],
      ],
    },
  },
]

const MODELS: Record<string, Model> = {
  pa18: {
    source: 'models-src/pa18/scene.gltf',
    output: 'public/models/pa18/scene.gltf',
    parent: 'pa18.obj.cleaner.gles',
    parts: PA18,
  },
  extra300: {
    source: 'models-src/extra300/scene.gltf',
    output: 'public/models/extra300/scene.gltf',
    parent: 'extra300',
    parts: EXTRA300,
  },
}

const model = MODELS[process.argv[2] ?? '']
if (!model) throw new Error(`usage: node scripts/split-model.ts <${Object.keys(MODELS).join('|')}>`)
const { source: SOURCE, output: OUTPUT, parent: PARENT, parts: PARTS } = model

// ---------------------------------------------------------------------------

interface Gltf {
  nodes: { name?: string; mesh?: number; children?: number[]; [k: string]: unknown }[]
  meshes: { name?: string; primitives: Primitive[] }[]
  accessors: Accessor[]
  bufferViews: {
    buffer: number
    byteOffset?: number
    byteLength: number
    byteStride?: number
    target?: number
  }[]
  buffers: { uri: string; byteLength: number }[]
  [k: string]: unknown
}
interface Primitive {
  attributes: { POSITION: number; NORMAL: number; TEXCOORD_0: number }
  indices: number
  material: number
  mode?: number
}
interface Accessor {
  bufferView: number
  byteOffset?: number
  componentType: number
  count: number
  type: string
  min?: number[]
  max?: number[]
}

/** One source mesh, with triangles that can be cut and claimed by parts. */
interface Geometry {
  node: string
  material: number
  position: Vector3[]
  normal: Vector3[]
  uv: [number, number][]
  /** Claimed triangles become null. */
  triangles: (V3 | null)[]
  /** Connected piece of each triangle (vertices welded by position). */
  piece: number[]
  pieceBounds: { min: Vector3; max: Vector3 }[]
}

const gltf = JSON.parse(readFileSync(SOURCE, 'utf8')) as Gltf
const bin = readFileSync(join(dirname(SOURCE), gltf.buffers[0]!.uri))

function read(index: number): number[][] {
  const a = gltf.accessors[index]!
  const view = gltf.bufferViews[a.bufferView]!
  const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type]!
  const size = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[a.componentType]!
  const stride = view.byteStride ?? width * size
  const base = (view.byteOffset ?? 0) + (a.byteOffset ?? 0)
  const out: number[][] = []
  for (let i = 0; i < a.count; i++) {
    const row: number[] = []
    for (let k = 0; k < width; k++) {
      const at = base + i * stride + k * size
      row.push(
        a.componentType === 5126
          ? bin.readFloatLE(at)
          : a.componentType === 5125
            ? bin.readUInt32LE(at)
            : a.componentType === 5123
              ? bin.readUInt16LE(at)
              : bin.readUInt8(at),
      )
    }
    out.push(row)
  }
  return out
}

const parentIndex = gltf.nodes.findIndex((n) => n.name === PARENT)
if (parentIndex < 0) throw new Error(`no node ${PARENT}`)
const geometries = new Map<string, Geometry>()
for (const child of gltf.nodes[parentIndex]!.children ?? []) {
  const node = gltf.nodes[child]!
  const extra = Object.keys(node).filter((k) => !['name', 'mesh'].includes(k))
  if (node.mesh === undefined || extra.length)
    throw new Error(`${node.name}: expected a bare mesh node`)
  const prims = gltf.meshes[node.mesh]!.primitives
  if (prims.length !== 1 || (prims[0]!.mode ?? 4) !== 4)
    throw new Error(`${node.name}: expected one triangle list`)
  const p = prims[0]!
  const idx = read(p.indices).map((r) => r[0]!)
  const triangles: V3[] = []
  for (let i = 0; i < idx.length; i += 3) triangles.push([idx[i]!, idx[i + 1]!, idx[i + 2]!])
  const position = read(p.attributes.POSITION).map((r) => new Vector3(r[0], r[1], r[2]))
  geometries.set(node.name!, {
    node: node.name!,
    material: p.material,
    position,
    normal: read(p.attributes.NORMAL).map((r) => new Vector3(r[0], r[1], r[2])),
    uv: read(p.attributes.TEXCOORD_0).map((r) => [r[0]!, r[1]!]),
    triangles,
    ...pieces(position, triangles),
  })
}

/** Labels each triangle with its connected piece, welding vertices by position. */
function pieces(position: Vector3[], triangles: V3[]) {
  const welded = new Map<string, number>()
  const id = position.map((p) => {
    const key = p
      .toArray()
      .map((x) => x.toFixed(5))
      .join()
    if (!welded.has(key)) welded.set(key, welded.size)
    return welded.get(key)!
  })
  const parent = [...welded.keys()].map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)))
  for (const t of triangles) for (const v of t.slice(1)) parent[find(id[v]!)] = find(id[t[0]]!)
  const label = new Map<number, number>()
  const piece = triangles.map((t) => {
    const root = find(id[t[0]]!)
    if (!label.has(root)) label.set(root, label.size)
    return label.get(root)!
  })
  const pieceBounds = [...label.keys()].map(() => ({
    min: new Vector3(INF, INF, INF),
    max: new Vector3(-INF, -INF, -INF),
  }))
  triangles.forEach((t, i) => {
    for (const v of t) {
      pieceBounds[piece[i]!]!.min.min(position[v]!)
      pieceBounds[piece[i]!]!.max.max(position[v]!)
    }
  })
  return { piece, pieceBounds }
}

const EPS = 1e-6
const inside = (v: Vector3, b: Box, skip?: Axis) =>
  [0, 1, 2].every(
    (k) =>
      k === skip || (v.getComponent(k) >= b.min[k]! - EPS && v.getComponent(k) <= b.max[k]! + EPS),
  )

/** Splits the candidate triangles that cross the plane; the halves keep their piece. */
function cut(g: Geometry, candidate: (i: number) => boolean, axis: Axis, at: number): number {
  const made = new Map<string, number>()
  const onEdge = (a: number, b: number): number => {
    const [i, j] = a < b ? [a, b] : [b, a]
    const key = `${i}:${j}`
    let v = made.get(key)
    if (v === undefined) {
      const di = g.position[i]!.getComponent(axis) - at
      const dj = g.position[j]!.getComponent(axis) - at
      const t = di / (di - dj)
      v = g.position.length
      g.position.push(g.position[i]!.clone().lerp(g.position[j]!, t))
      g.normal.push(g.normal[i]!.clone().lerp(g.normal[j]!, t).normalize())
      const [ui, uj] = [g.uv[i]!, g.uv[j]!]
      g.uv.push([ui[0] + (uj[0] - ui[0]) * t, ui[1] + (uj[1] - ui[1]) * t])
      made.set(key, v)
    }
    return v
  }
  let count = 0
  const triangles: (V3 | null)[] = []
  const piece: number[] = []
  g.triangles.forEach((tri, i) => {
    const d = tri?.map((v) => g.position[v]!.getComponent(axis) - at)
    if (!tri || !d || !candidate(i) || d.every((x) => x >= -EPS) || d.every((x) => x <= EPS)) {
      triangles.push(tri)
      piece.push(g.piece[i]!)
      return
    }
    // Sutherland-Hodgman against both half-spaces; keeps the winding.
    for (const side of [1, -1]) {
      const poly: number[] = []
      for (let k = 0; k < 3; k++) {
        const a = tri[k]!
        const b = tri[(k + 1) % 3]!
        const da = side * d[k]!
        const db = side * d[(k + 1) % 3]!
        if (da >= -EPS) poly.push(a)
        if ((da > EPS && db < -EPS) || (da < -EPS && db > EPS)) poly.push(onEdge(a, b))
      }
      for (let k = 1; k + 1 < poly.length; k++) {
        triangles.push([poly[0]!, poly[k]!, poly[k + 1]!])
        piece.push(g.piece[i]!)
      }
    }
    count++
  })
  g.triangles = triangles
  g.piece = piece
  return count
}

/** Cuts if asked, then claims the take's triangles so no other part or the remainder gets them. */
function take(g: Geometry, t: Take): { triangles: V3[]; cuts: number } {
  const skip = t.cut?.axis
  const candidate = (i: number) => {
    const tri = g.triangles[i]
    if (!tri) return false
    if (!t.pieces) return tri.every((v) => inside(g.position[v]!, t.box, skip))
    const b = g.pieceBounds[g.piece[i]!]!
    return inside(b.min, t.box, skip) && inside(b.max, t.box, skip)
  }
  const cuts = t.cut ? cut(g, candidate, t.cut.axis, t.cut.at) : 0
  const triangles: V3[] = []
  g.triangles = g.triangles.map((tri, i) => {
    if (!tri || !candidate(i)) return tri
    if (skip !== undefined && !tri.every((v) => inside(g.position[v]!, t.box))) return tri
    triangles.push(tri)
    return null
  })
  return { triangles, cuts }
}

interface Claimed {
  geometry: Geometry
  triangles: V3[]
}
interface Frame {
  pivot: Vector3
  rotation: Quaternion
}

function bounds(points: Vector3[]) {
  const min = new Vector3(INF, INF, INF)
  const max = new Vector3(-INF, -INF, -INF)
  for (const p of points) {
    min.min(p)
    max.max(p)
  }
  return { min, max }
}

function frameFor(pivot: Pivot, claimed: Claimed[]): Frame {
  const points = claimed.flatMap((c) => c.triangles.flat().map((v) => c.geometry.position[v]!))
  const unique = [...new Set(points)]
  const X = new Vector3(1, 0, 0)
  if ('through' in pivot) {
    const [a, b] = pivot.through.map((p) => new Vector3(...p))
    return hinge(a!, b!)
  }
  if ('spin' in pivot) {
    const { min, max } = bounds(unique)
    const axis = new Vector3(...pivot.spin).normalize()
    return {
      pivot: pivot.hub ? new Vector3(...pivot.hub) : min.add(max).multiplyScalar(0.5),
      rotation: new Quaternion().setFromUnitVectors(X, axis),
    }
  }
  // Hinge line: bounds centres of each half of the line vertices along the span.
  const line = unique.filter((p) => inside(p, pivot.line))
  const span = bounds(line)
  const mid = (span.min.getComponent(pivot.along) + span.max.getComponent(pivot.along)) / 2
  const centre = (ps: Vector3[]) => {
    if (ps.length < 2) throw new Error('too few hinge-line vertices')
    const { min, max } = bounds(ps)
    return min.add(max).multiplyScalar(0.5)
  }
  const a = centre(line.filter((p) => p.getComponent(pivot.along) < mid))
  const b = centre(line.filter((p) => p.getComponent(pivot.along) >= mid))
  const axis = b.clone().sub(a).normalize()
  const origin = a.clone().add(b).multiplyScalar(0.5)
  const arm = (p: Vector3) => {
    const r = p.clone().sub(origin)
    return r.sub(axis.clone().multiplyScalar(r.dot(axis)))
  }
  const edge = unique.reduce((m, p) => (arm(p).length() > arm(m).length() ? p : m))
  const sense = axis
    .clone()
    .cross(arm(edge))
    .dot(new Vector3(...pivot.trailingEdge))
  return sense < 0 ? hinge(b, a) : hinge(a, b)
}

/** Frame on the hinge from `a` to `b`, with its local +X along it. */
function hinge(a: Vector3, b: Vector3): Frame {
  const axis = b.clone().sub(a).normalize()
  return {
    pivot: a.clone().add(b).multiplyScalar(0.5),
    rotation: new Quaternion().setFromUnitVectors(new Vector3(1, 0, 0), axis),
  }
}

// ---------------------------------------------------------------------------
// Build the output: remainder meshes plus one node per part.

const positions: number[][] = []
const out = {
  nodes: [] as Record<string, unknown>[],
  meshes: [] as { name: string; primitives: Primitive[] }[],
  accessors: [] as Accessor[],
  bufferViews: [] as Gltf['bufferViews'],
  chunks: [] as Buffer[],
  length: 0,
}

function addView(data: Buffer, target: number): number {
  const pad = (4 - (out.length % 4)) % 4
  if (pad) out.chunks.push(Buffer.alloc(pad))
  out.length += pad
  out.bufferViews.push({ buffer: 0, byteOffset: out.length, byteLength: data.length, target })
  out.chunks.push(data)
  out.length += data.length
  return out.bufferViews.length - 1
}

function addAccessor(
  values: number[],
  type: string,
  componentType: number,
  target: number,
  minMax = false,
): number {
  const width = { SCALAR: 1, VEC2: 2, VEC3: 3 }[type]!
  const data = Buffer.alloc(values.length * 4)
  values.forEach((v, i) =>
    componentType === 5126 ? data.writeFloatLE(v, i * 4) : data.writeUInt32LE(v, i * 4),
  )
  const a: Accessor = {
    bufferView: addView(data, target),
    componentType,
    count: values.length / width,
    type,
  }
  if (minMax) {
    a.min = [INF, INF, INF]
    a.max = [-INF, -INF, -INF]
    for (let i = 0; i < values.length; i++) {
      a.min[i % 3] = Math.min(a.min[i % 3]!, Math.fround(values[i]!))
      a.max[i % 3] = Math.max(a.max[i % 3]!, Math.fround(values[i]!))
    }
  }
  out.accessors.push(a)
  return out.accessors.length - 1
}

/** One mesh from claimed triangles (one primitive per material), in `frame`. */
function addMesh(name: string, claimed: Claimed[], frame: Frame | null): number {
  const toLocal = frame?.rotation.clone().invert()
  const byMaterial = new Map<number, Claimed[]>()
  for (const c of claimed)
    byMaterial.set(c.geometry.material, [...(byMaterial.get(c.geometry.material) ?? []), c])
  const primitives: Primitive[] = []
  for (const [material, group] of byMaterial) {
    const pos: number[] = []
    const nor: number[] = []
    const uv: number[] = []
    const idx: number[] = []
    for (const { geometry: g, triangles } of group) {
      const remap = new Map<number, number>()
      for (const tri of triangles)
        for (const v of tri) {
          let i = remap.get(v)
          if (i === undefined) {
            i = pos.length / 3
            remap.set(v, i)
            const p = g.position[v]!.clone()
            const n = g.normal[v]!.clone()
            if (frame) {
              p.sub(frame.pivot).applyQuaternion(toLocal!)
              n.applyQuaternion(toLocal!)
            }
            pos.push(p.x, p.y, p.z)
            nor.push(n.x, n.y, n.z)
            uv.push(...g.uv[v]!)
            if (!frame) positions.push([p.x, p.y, p.z])
          }
          idx.push(i)
        }
    }
    primitives.push({
      attributes: {
        NORMAL: addAccessor(nor, 'VEC3', 5126, 34962),
        POSITION: addAccessor(pos, 'VEC3', 5126, 34962, true),
        TEXCOORD_0: addAccessor(uv, 'VEC2', 5126, 34962),
      },
      indices: addAccessor(idx, 'SCALAR', 5125, 34963),
      material,
      mode: 4,
    })
  }
  out.meshes.push({ name, primitives })
  return out.meshes.length - 1
}

const round = (x: number) => Math.round(x * 1e6) / 1e6

/** Claims a part's triangles (and its children's), returning its node index. */
function addPart(part: Part, parentFrame: Frame | null): number {
  const claimed: Claimed[] = []
  for (const t of part.take) {
    const g = geometries.get(t.from)
    if (!g) throw new Error(`${part.name}: no mesh node ${t.from}`)
    const { triangles, cuts } = take(g, t)
    if (!triangles.length) throw new Error(`${part.name}: nothing inside its box in ${t.from}`)
    claimed.push({ geometry: g, triangles })
    console.log(
      `${part.name.padEnd(18)} ${String(triangles.length).padStart(5)} triangles from ${t.from}${cuts ? `, ${cuts} cut` : ''}`,
    )
  }
  const frame = part.pivot ? frameFor(part.pivot, claimed) : parentFrame!
  const node: Record<string, unknown> = {
    name: part.name,
    mesh: addMesh(part.name, claimed, frame),
  }
  if (part.pivot) {
    node.translation = frame.pivot.toArray().map(round)
    node.rotation = frame.rotation.toArray().map(round)
    const axis = new Vector3(1, 0, 0).applyQuaternion(frame.rotation)
    console.log(
      `${''.padEnd(18)} pivot ${(node.translation as number[]).join(', ')}  axis ${axis
        .toArray()
        .map((x) => x.toFixed(4))
        .join(', ')}`,
    )
  }
  out.nodes.push(node)
  const index = out.nodes.length - 1
  if (part.children) node.children = part.children.map((c) => addPart(c, frame))
  return index
}

// The parent keeps its place: under the export's root node, or as the scene root.
const root = gltf.nodes.findIndex((n) => n.children?.includes(parentIndex))
if (root >= 0) out.nodes.push({ ...gltf.nodes[root], children: [1] })
const parentNode = out.nodes.length
out.nodes.push({ name: PARENT, children: [] })
const partNodes = PARTS.map((p) => addPart(p, null))
const meshNodes: number[] = []
for (const g of geometries.values()) {
  const triangles = g.triangles.filter((t): t is V3 => t !== null)
  if (!triangles.length) continue
  out.nodes.push({ name: g.node, mesh: addMesh(g.node, [{ geometry: g, triangles }], null) })
  meshNodes.push(out.nodes.length - 1)
}
out.nodes[parentNode]!.children = [...meshNodes, ...partNodes]

const binName = basename(OUTPUT).replace(/\.gltf$/, '.bin')
const buffer = Buffer.concat(out.chunks)
const result = {
  ...gltf,
  scenes: (gltf.scenes as { nodes: number[] }[]).map((s) => ({ ...s, nodes: [0] })),
  nodes: out.nodes,
  meshes: out.meshes,
  accessors: out.accessors,
  bufferViews: out.bufferViews,
  buffers: [{ byteLength: buffer.length, uri: binName }],
}
mkdirSync(dirname(OUTPUT), { recursive: true })
writeFileSync(OUTPUT, JSON.stringify(result, null, 1) + '\n')
writeFileSync(join(dirname(OUTPUT), binName), buffer)
for (const image of (gltf.images ?? []) as { uri?: string }[]) {
  const from = image.uri && join(dirname(SOURCE), decodeURIComponent(image.uri))
  if (!from || !existsSync(from)) continue
  const to = join(dirname(OUTPUT), decodeURIComponent(image.uri!))
  mkdirSync(dirname(to), { recursive: true })
  copyFileSync(from, to)
}
console.log(`wrote ${OUTPUT} (${out.nodes.length} nodes, ${buffer.length} bytes)`)
