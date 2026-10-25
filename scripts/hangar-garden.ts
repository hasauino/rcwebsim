/**
 * Bakes the garden seen through the hangar's door and window into
 * public/assets/hangar/garden.glb: a hedge across the end of the drive and
 * down the side, and a few trees, grown with ez-tree like the field's trees.
 *
 * Grown at runtime it cost the hangar the 4 MB ez-tree chunk and about
 * 800k triangles, nearly all in the hedge. Seen from 15 m and more, much
 * less does: each kind is grown once, its bark simplified and most of its
 * leaf cards dropped (the rest grow to cover the same crown), and every
 * plant is an instance of its kind (EXT_mesh_gpu_instancing). The hangar
 * gives the leaves the field's material (`leafMaterial` in trees.ts).
 *
 * Usage (Node 22.18+ runs TypeScript directly):
 *     node scripts/hangar-garden.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { Document, NodeIO, type Material, type Texture } from '@gltf-transform/core'
import {
  ALL_EXTENSIONS,
  EXTMeshGPUInstancing,
  EXTMeshoptCompression,
} from '@gltf-transform/extensions'
import { reorder } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import sharp from 'sharp'
import { Box3, Color, Quaternion, Vector3, type BufferGeometry } from 'three'
import { Rng } from '../src/sim/rng.ts'

// ez-tree loads its textures through an <img> as it is imported. Node has
// none: give it one that never loads; the texture files are read below.
Object.assign(globalThis, {
  document: { createElementNS: () => ({ addEventListener() {}, removeEventListener() {} }) },
})
const { Tree } = await import('@dgreenheck/ez-tree')
const ASSETS = join(
  dirname(createRequire(import.meta.url).resolve('@dgreenheck/ez-tree')),
  '../src/lib/assets',
)
const OUT = 'public/assets/hangar/garden.glb'

/**
 * The garage's front wall and right wall, m: half ROOM's depth and width in
 * src/render/hangar/room.ts (garden.test.ts checks the garden stays outside).
 */
const FRONT_Z = 3.25
const RIGHT_X = 3

interface Kind {
  preset: string
  seed: number
  /** Fraction of the bark's triangles kept. */
  bark: number
  /** Fraction of the leaf cards kept. */
  leaves: number
}

/** Each kind grown once; the same presets and seeds as the field's trees (PRESETS in trees.ts). */
const KINDS = {
  'bush-a': { preset: 'Bush 1', seed: 5121, bark: 0.06, leaves: 0.2 },
  'bush-b': { preset: 'Bush 1', seed: 77, bark: 0.06, leaves: 0.2 },
  'oak-a': { preset: 'Oak Large', seed: 23399, bark: 0.25, leaves: 0.5 },
  'oak-b': { preset: 'Oak Large', seed: 811, bark: 0.25, leaves: 0.5 },
  'ash-a': { preset: 'Ash Large', seed: 4417, bark: 0.25, leaves: 0.5 },
} satisfies Record<string, Kind>
type KindId = keyof typeof KINDS

interface Plant {
  kind: KindId
  at: Vector3
  height: number
}

/** Hedge across the end of the drive and along the right-hand boundary; four trees. */
function layout(rng: Rng): Plant[] {
  const plants: Plant[] = []
  const bush = (n: number): KindId => (Math.abs(Math.round(n)) % 2 ? 'bush-b' : 'bush-a')
  for (let x = -26; x <= 26; x += 1.6)
    plants.push({
      kind: bush(x),
      at: new Vector3(x + rng.range(-0.3, 0.3), -0.1, FRONT_Z + 16),
      height: rng.range(1.6, 2.2),
    })
  for (let z = -8; z < FRONT_Z + 16; z += 1.6)
    plants.push({
      kind: bush(z),
      at: new Vector3(RIGHT_X + 9 + rng.range(-0.3, 0.3), -0.1, z),
      height: rng.range(1.5, 2),
    })
  plants.push({ kind: 'oak-a', at: new Vector3(-9, -0.1, FRONT_Z + 22), height: 11 })
  plants.push({ kind: 'oak-b', at: new Vector3(10, -0.1, FRONT_Z + 26), height: 13 })
  plants.push({ kind: 'ash-a', at: new Vector3(22, -0.1, FRONT_Z + 6), height: 12 })
  plants.push({ kind: 'oak-b', at: new Vector3(-24, -0.1, FRONT_Z + 10), height: 10 })
  return plants
}

interface Grown {
  height: number
  bark: BufferGeometry
  leaves: BufferGeometry
  barkType: string
  leafType: string
  barkTint: number
  leafTint: number
}

function grow(kind: Kind): Grown {
  const tree = new Tree()
  tree.loadPreset(kind.preset)
  tree.options.seed = kind.seed
  tree.options.leaves.size *= 1.2
  tree.generate()
  const bark = (tree.branchesMesh as unknown as { geometry: BufferGeometry }).geometry
  const leaves = (tree.leavesMesh as unknown as { geometry: BufferGeometry }).geometry
  // The bark texture's repeat, baked into the UVs.
  const { x: su, y: sv } = tree.options.bark.textureScale
  const uv = bark.attributes.uv!
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) / sv)
  return {
    height: new Box3().setFromObject(tree).getSize(new Vector3()).y,
    bark: simplify(bark, kind.bark),
    leaves: thin(leaves, kind.leaves),
    barkType: tree.options.bark.type,
    leafType: tree.options.leaves.type,
    barkTint: tree.options.bark.tint,
    leafTint: tree.options.leaves.tint,
  }
}

/** Keeps `keep` of the triangles, letting the shape go a little. */
function simplify(g: BufferGeometry, keep: number): BufferGeometry {
  const index = new Uint32Array(g.index!.array)
  const target = Math.floor((index.length * keep) / 3) * 3
  const [kept] = MeshoptSimplifier.simplify(
    index,
    new Float32Array(g.attributes.position!.array),
    3,
    target,
    0.05,
  )
  g.setIndex(Array.from(kept))
  return g
}

/**
 * Keeps `keep` of the leaves, each grown about its middle to cover what the
 * dropped ones did. ez-tree's double billboards are two quads, 8 vertices,
 * in order.
 */
function thin(g: BufferGeometry, keep: number): BufferGeometry {
  const pos = g.attributes.position!
  const leaves = pos.count / 8
  const every = Math.round(1 / keep)
  const scale = Math.sqrt(every)
  const index: number[] = []
  const middle = new Vector3()
  const p = new Vector3()
  for (let leaf = 0; leaf < leaves; leaf += every) {
    const first = leaf * 8
    middle.set(0, 0, 0)
    for (let i = first; i < first + 8; i++) middle.add(p.fromBufferAttribute(pos, i))
    middle.divideScalar(8)
    for (let i = first; i < first + 8; i++) {
      p.fromBufferAttribute(pos, i).sub(middle).multiplyScalar(scale).add(middle)
      pos.setXYZ(i, p.x, p.y, p.z)
    }
    for (const q of [first, first + 4]) index.push(q, q + 1, q + 2, q, q + 2, q + 3)
  }
  g.setIndex(index)
  return g
}

async function webp(file: string, side: number): Promise<Uint8Array> {
  return sharp(readFileSync(file)).resize(side, side).webp({ quality: 80 }).toBuffer()
}

await MeshoptSimplifier.ready
await MeshoptEncoder.ready
const doc = new Document()
const buffer = doc.createBuffer()
const instancing = doc.createExtension(EXTMeshGPUInstancing).setRequired(true)
const scene = doc.createScene('garden')
const textures = new Map<string, Texture>()
const texture = async (file: string, side: number) => {
  if (!textures.has(file))
    textures.set(
      file,
      doc
        .createTexture(file.split('/').pop())
        .setImage(await webp(join(ASSETS, file), side))
        .setMimeType('image/webp'),
    )
  return textures.get(file)!
}
const linear = (hex: number) => {
  const c = new Color(hex)
  return [c.r, c.g, c.b, 1] as [number, number, number, number]
}

/** One kind's bark or leaves as a primitive, every plant of it an instance. */
function part(
  name: string,
  g: BufferGeometry,
  material: Material,
  plants: { matrix: { t: Vector3; r: Quaternion; s: Vector3 }; tint: Color }[],
  tinted: boolean,
) {
  const attribute = (array: ArrayLike<number>, type: 'VEC2' | 'VEC3' | 'VEC4' | 'SCALAR') =>
    doc.createAccessor().setArray(new Float32Array(array)).setType(type).setBuffer(buffer)
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', attribute(g.attributes.position!.array, 'VEC3'))
    .setAttribute('NORMAL', attribute(g.attributes.normal!.array, 'VEC3'))
    .setAttribute('TEXCOORD_0', attribute(g.attributes.uv!.array, 'VEC2'))
    .setIndices(
      doc
        .createAccessor()
        .setArray(new Uint32Array(g.index!.array))
        .setType('SCALAR')
        .setBuffer(buffer),
    )
    .setMaterial(material)
  const batch = instancing
    .createInstancedMesh()
    .setAttribute(
      'TRANSLATION',
      attribute(
        plants.flatMap((p) => p.matrix.t.toArray()),
        'VEC3',
      ),
    )
    .setAttribute(
      'ROTATION',
      attribute(
        plants.flatMap((p) => p.matrix.r.toArray()),
        'VEC4',
      ),
    )
    .setAttribute(
      'SCALE',
      attribute(
        plants.flatMap((p) => p.matrix.s.toArray()),
        'VEC3',
      ),
    )
  // Each crown a slightly different green.
  if (tinted)
    batch.setAttribute(
      '_COLOR_0',
      attribute(
        plants.flatMap((p) => p.tint.toArray()),
        'VEC3',
      ),
    )
  const node = doc
    .createNode(name)
    .setMesh(doc.createMesh(name).addPrimitive(prim))
    .setExtension('EXT_mesh_gpu_instancing', batch)
  scene.addChild(node)
}

const rng = new Rng(7)
const plants = layout(rng)
const up = new Vector3(0, 1, 0)
for (const [id, kind] of Object.entries(KINDS) as [KindId, Kind][]) {
  const grown = grow(kind)
  // Each plant turned and stretched a little at random, and tinted: some
  // darker, some yellower.
  const instances = plants
    .filter((p) => p.kind === id)
    .map((p) => {
      const s = p.height / grown.height
      const v = rng.range(0.8, 1.1)
      return {
        matrix: {
          t: p.at,
          r: new Quaternion().setFromAxisAngle(up, rng.range(0, Math.PI * 2)),
          s: new Vector3(s, s * rng.range(0.92, 1.08), s),
        },
        tint: new Color(v * rng.range(0.95, 1.08), v, v * rng.range(0.85, 1)),
      }
    })
  const bark = doc
    .createMaterial(`${id}-bark`)
    .setBaseColorFactor(linear(grown.barkTint))
    .setBaseColorTexture(await texture(`bark/${grown.barkType}_color_1k.jpg`, 256))
    .setNormalTexture(await texture(`bark/${grown.barkType}_normal_1k.jpg`, 256))
    .setRoughnessFactor(1)
    .setMetallicFactor(0)
  const leaves = doc
    .createMaterial(`${id}-leaves`)
    .setBaseColorFactor(linear(grown.leafTint))
    .setBaseColorTexture(await texture(`leaves/${grown.leafType}_color.png`, 512))
    .setAlphaMode('MASK')
    .setAlphaCutoff(0.5)
    .setDoubleSided(true)
    .setRoughnessFactor(0.75)
    .setMetallicFactor(0)
  part(`${id}-bark`, grown.bark, bark, instances, false)
  part(`${id}-leaves`, grown.leaves, leaves, instances, true)
}
await doc.transform(reorder({ encoder: MeshoptEncoder }))
doc
  .createExtension(EXTMeshoptCompression)
  .setRequired(true)
  .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER })
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
writeFileSync(OUT, await io.writeBinary(doc))
console.log(`${OUT}: ${(readFileSync(OUT).length / 1e6).toFixed(2)} MB, ${plants.length} plants`)
