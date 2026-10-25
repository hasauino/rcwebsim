import { readFileSync } from 'node:fs'
import { NodeIO, type Accessor, type Node } from '@gltf-transform/core'
import { ALL_EXTENSIONS, type InstancedMesh } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
import { beforeAll, describe, expect, it } from 'vitest'
import { GARDEN_URL } from './props'
import { ROOM } from './room'

interface Part {
  name: string
  triangles: number
  /** Where each copy stands, m. */
  at: [number, number, number][]
}

let parts: Part[] = []

beforeAll(async () => {
  await MeshoptDecoder.ready
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
  const doc = await io.readBinary(readFileSync(`public/${GARDEN_URL}`))
  parts = doc
    .getRoot()
    .listNodes()
    .filter((n: Node) => n.getMesh())
    .map((n: Node) => {
      const triangles = n
        .getMesh()!
        .listPrimitives()
        .reduce((sum, p) => sum + (p.getIndices()?.getCount() ?? 0) / 3, 0)
      const batch = n.getExtension<InstancedMesh>('EXT_mesh_gpu_instancing')
      const translation = batch?.getAttribute('TRANSLATION') as Accessor | null | undefined
      const at = translation
        ? Array.from({ length: translation.getCount() }, (_, i) =>
            translation.getElement(i, [0, 0, 0]),
          )
        : [n.getTranslation()]
      return { name: n.getName(), triangles, at: at as Part['at'] }
    })
})

describe('the baked garden', () => {
  it('stays inside its triangle budget, every copy counted', () => {
    const drawn = parts.reduce((sum, p) => sum + p.triangles * p.at.length, 0)
    expect(drawn).toBeGreaterThan(20_000)
    expect(drawn).toBeLessThan(150_000)
  })

  it('has its hedge and trees', () => {
    const copies = (kind: string) =>
      parts.filter((p) => p.name.startsWith(kind)).reduce((n, p) => n + p.at.length, 0)
    // Bark and leaves of each: one copy per plant for both.
    expect(copies('bush')).toBeGreaterThan(80)
    expect(copies('oak') + copies('ash')).toBe(8)
  })

  it('grows outside the garage and off the drive', () => {
    const X = ROOM.width / 2 + ROOM.wall
    const Z = ROOM.depth / 2 + ROOM.wall
    const drive = ROOM.door.width / 2 + 0.6
    for (const p of parts)
      for (const [x, , z] of p.at) {
        const inGarage = Math.abs(x) < X + 1 && Math.abs(z) < Z + 1
        const onDrive = Math.abs(x) < drive + 1 && z > 0 && z < Z + 14
        expect(inGarage || onDrive, `${p.name} at ${x.toFixed(1)}, ${z.toFixed(1)}`).toBe(false)
      }
  })
})
