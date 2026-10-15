import {
  Box3,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { terrainHeight, treeLayout } from '../sim/field'
import { Rng } from '../sim/rng'

const MODELS = [
  'tree_oak',
  'tree_default',
  'tree_detailed',
  'tree_fat',
  'tree_pineRoundA',
  'tree_pineDefaultA',
]

/** Kenney's palette is stylised teal; pull it towards temperate greens. */
function naturalMaterial(source: Material, rng: Rng): MeshStandardNodeMaterial {
  const name = source.name.toLowerCase()
  const leaf = name.includes('leaf')
  const dark = name.includes('dark')
  const color = leaf
    ? new Color().setHSL(0.24 + rng.range(-0.03, 0.03), 0.42, dark ? 0.2 : 0.26)
    : new Color(0x5b4634)
  return new MeshStandardNodeMaterial({ color, roughness: leaf ? 0.85 : 0.95, flatShading: true })
}

/** All field trees as one InstancedMesh per model part. */
export async function createTrees(): Promise<Group> {
  const loader = new GLTFLoader()
  const rng = new Rng(11)
  const models = await Promise.all(
    MODELS.map(async (name) => {
      const gltf = await loader.loadAsync(`assets/trees/${name}.glb`)
      gltf.scene.updateMatrixWorld(true)
      const height = new Box3().setFromObject(gltf.scene).getSize(new Vector3()).y
      const parts: { geometry: BufferGeometry; material: MeshStandardNodeMaterial }[] = []
      gltf.scene.traverse((o) => {
        if (o instanceof Mesh) {
          const geometry = (o.geometry as BufferGeometry).clone().applyMatrix4(o.matrixWorld)
          parts.push({ geometry, material: naturalMaterial(o.material as Material, rng) })
        }
      })
      return { height, parts }
    }),
  )

  const trees = treeLayout()
  const byModel = models.map(() => [] as Matrix4[])
  const q = new Quaternion()
  const up = new Vector3(0, 1, 0)
  trees.forEach((tree, i) => {
    const index = (i * 7 + Math.floor(tree.height)) % models.length
    const model = models[index]!
    const s = tree.height / model.height
    const widen = tree.canopyRadius / (tree.height * 0.26)
    q.setFromAxisAngle(up, rng.range(0, Math.PI * 2))
    byModel[index]!.push(
      new Matrix4().compose(
        new Vector3(tree.x, terrainHeight(tree.x, tree.z) - 0.1, tree.z),
        q,
        new Vector3(s * widen, s, s * widen),
      ),
    )
  })

  const group = new Group()
  group.name = 'trees'
  models.forEach((model, i) => {
    const matrices = byModel[i]!
    if (matrices.length === 0) return
    for (const part of model.parts) {
      const mesh = new InstancedMesh(part.geometry, part.material, matrices.length)
      matrices.forEach((m, j) => mesh.setMatrixAt(j, m))
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.computeBoundingSphere()
      group.add(mesh)
    }
  })
  return group
}
