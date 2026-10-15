import {
  Box3,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Mesh,
  type MeshPhongMaterial,
  type Texture,
} from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { dFdx, dFdy, dot, float, log2, max, normalViewGeometry, texture, uv } from 'three/tsl'
import { terrainHeight, treeLayout, type Tree } from '../sim/field'
import { Rng } from '../sim/rng'

type Species = 'oak' | 'ash' | 'pine' | 'bush'

/** ez-tree presets per species, each grown from two seeds for variety. */
const PRESETS: Record<Species, { preset: string; seeds: number[] }> = {
  oak: { preset: 'Oak Large', seeds: [23399, 811] },
  ash: { preset: 'Ash Large', seeds: [4417, 9203] },
  pine: { preset: 'Pine Large', seeds: [44166, 3170] },
  bush: { preset: 'Bush 1', seeds: [5121, 77] },
}

interface Variant {
  height: number
  bark: { geometry: BufferGeometry; material: MeshStandardNodeMaterial }
  leaves: { geometry: BufferGeometry; material: MeshStandardNodeMaterial }
}

/**
 * Leaf cards lit as one rounded canopy: each card's normal leans out from the
 * crown's centre, so the tree shades like a volume instead of flat confetti.
 */
function canopyNormals(geometry: BufferGeometry): void {
  geometry.computeBoundingBox()
  const center = geometry.boundingBox!.getCenter(new Vector3())
  const pos = geometry.attributes.position!
  const nor = geometry.attributes.normal!
  const p = new Vector3()
  const n = new Vector3()
  const out = new Vector3()
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i)
    n.fromBufferAttribute(nor, i)
    out.subVectors(p, center).normalize()
    n.lerp(out, 0.8).normalize()
    nor.setXYZ(i, n.x, n.y, n.z)
  }
}

async function growVariants(): Promise<Record<Species, Variant[]>> {
  const { Tree: EzTree } = await import('@dgreenheck/ez-tree')
  const result = {} as Record<Species, Variant[]>
  for (const [species, { preset, seeds }] of Object.entries(PRESETS) as [
    Species,
    (typeof PRESETS)[Species],
  ][]) {
    result[species] = seeds.map((seed) => {
      const tree = new EzTree()
      tree.loadPreset(preset)
      tree.options.seed = seed
      tree.options.leaves.size *= 1.2
      tree.generate()
      // ez-tree sets a roughness map on its Phong bark material too.
      const barkSource = tree.branchesMesh.material as MeshPhongMaterial & {
        roughnessMap: Texture | null
      }
      const leafSource = tree.leavesMesh.material as MeshPhongMaterial
      const bark = new MeshStandardNodeMaterial({
        map: barkSource.map,
        normalMap: barkSource.normalMap,
        roughnessMap: barkSource.roughnessMap,
        aoMap: barkSource.aoMap,
        color: barkSource.color,
      })
      const leavesGeometry = (tree.leavesMesh as Mesh).geometry
      canopyNormals(leavesGeometry)
      const leaves = new MeshStandardNodeMaterial({
        map: leafSource.map,
        color: leafSource.color,
        side: DoubleSide,
        alphaTest: 0.5,
        alphaToCoverage: true,
        roughness: 0.75,
      })
      // Mipmaps average leaf alpha towards zero, so distant crowns thin to
      // bare twigs. Boost alpha by the mip level being sampled to keep them full.
      const texel = uv().mul(1024)
      const dx = dFdx(texel)
      const dy = dFdy(texel)
      const lod = max(float(0), log2(max(dot(dx, dx), dot(dy, dy))).mul(0.5))
      leaves.opacityNode = texture(leafSource.map!).a.mul(lod.mul(0.3).add(1))
      // Both faces of a card share the canopy normal.
      leaves.normalNode = normalViewGeometry
      const height = new Box3().setFromObject(tree).getSize(new Vector3()).y
      return {
        height,
        bark: { geometry: (tree.branchesMesh as Mesh).geometry, material: bark },
        leaves: { geometry: leavesGeometry, material: leaves },
      }
    })
  }
  return result
}

/** Which kind of tree grows where: hedgerows, the windbreak, or open field. */
function speciesFor(tree: Tree, i: number): Species {
  const windbreak = Math.abs(tree.x + 280) < 12
  if (windbreak) return 'pine'
  const hedgerow = Math.abs(tree.z + 190) < 12 || Math.abs(tree.z - 150) < 12
  if (hedgerow) return i % 3 === 0 ? 'ash' : 'oak'
  return i % 4 === 0 ? 'pine' : 'oak'
}

/** Undergrowth along the hedgerows, between and under the trees. */
function bushLayout(trees: Tree[]): { x: number; z: number; size: number }[] {
  const rng = new Rng(29)
  const bushes: { x: number; z: number; size: number }[] = []
  for (const t of trees) {
    if (Math.hypot(t.x, t.z) > 320) continue
    const n = Math.floor(rng.range(1, 4))
    for (let k = 0; k < n; k++) {
      bushes.push({
        x: t.x + rng.range(-7, 7),
        z: t.z + rng.range(-4, 4),
        size: rng.range(1.6, 3.2),
      })
    }
  }
  return bushes
}

/** All field trees and bushes, instanced per variant. */
export async function createTrees(): Promise<Group> {
  const variants = await growVariants()
  const rng = new Rng(11)
  const placements = new Map<Variant, Matrix4[]>()
  const tints = new Map<Variant, Color[]>()
  const q = new Quaternion()
  const up = new Vector3(0, 1, 0)
  const place = (variant: Variant, x: number, z: number, height: number) => {
    const s = height / variant.height
    q.setFromAxisAngle(up, rng.range(0, Math.PI * 2))
    const m = new Matrix4().compose(
      new Vector3(x, terrainHeight(x, z) - 0.15, z),
      q,
      new Vector3(s, s * rng.range(0.92, 1.08), s),
    )
    if (!placements.has(variant)) {
      placements.set(variant, [])
      tints.set(variant, [])
    }
    placements.get(variant)!.push(m)
    // Each crown a slightly different green: some darker, some yellower.
    const v = rng.range(0.8, 1.1)
    tints.get(variant)!.push(new Color(v * rng.range(0.95, 1.08), v, v * rng.range(0.85, 1)))
  }

  const trees = treeLayout()
  trees.forEach((tree, i) => {
    const options = variants[speciesFor(tree, i)]
    place(options[i % options.length]!, tree.x, tree.z, tree.height)
  })
  bushLayout(trees).forEach((b, i) => place(variants.bush[i % 2]!, b.x, b.z, b.size))

  const group = new Group()
  group.name = 'trees'
  for (const [variant, matrices] of placements) {
    const colors = tints.get(variant)!
    for (const [part, tinted] of [
      [variant.bark, false],
      [variant.leaves, true],
    ] as const) {
      const mesh = new InstancedMesh(part.geometry, part.material, matrices.length)
      matrices.forEach((m, j) => {
        mesh.setMatrixAt(j, m)
        if (tinted) mesh.setColorAt(j, colors[j]!)
      })
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.computeBoundingSphere()
      group.add(mesh)
    }
  }
  return group
}
