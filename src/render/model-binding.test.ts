import { readFileSync } from 'node:fs'
import { Group, MathUtils, Mesh, Quaternion, Vector3, type Object3D } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { AIRCRAFT } from '../sim/aircraft'
import type { AircraftSpec } from '../sim/aircraft/types'
import { createSimulation } from '../sim/simulation'

/**
 * Loads the aircraft's glTF the way AircraftView does, into a group that is
 * the body frame. Textures are dropped and the model is packed as a GLB, so
 * it parses in Node without fetch or image decoding.
 */
async function loadModel(spec: AircraftSpec): Promise<Group> {
  const path = `public/${spec.model.url}`
  const json = JSON.parse(readFileSync(path, 'utf8'))
  const bin = readFileSync(new URL(json.buffers[0].uri, `file://${process.cwd()}/${path}`))
  delete json.buffers[0].uri
  delete json.images
  delete json.textures
  delete json.samplers
  for (const m of json.materials) delete m.pbrMetallicRoughness?.baseColorTexture

  const pad = (b: Buffer, fill: number) =>
    Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, fill)])
  const chunk = (type: number, data: Buffer) => {
    const head = Buffer.alloc(8)
    head.writeUInt32LE(data.length, 0)
    head.writeUInt32LE(type, 4)
    return Buffer.concat([head, data])
  }
  const jsonChunk = chunk(0x4e4f534a, pad(Buffer.from(JSON.stringify(json)), 0x20))
  const binChunk = chunk(0x004e4942, pad(bin, 0))
  const header = Buffer.alloc(12)
  header.writeUInt32LE(0x46546c67, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(12 + jsonChunk.length + binChunk.length, 8)
  const glb = Buffer.concat([header, jsonChunk, binChunk])
  const gltf = await new GLTFLoader().parseAsync(
    glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.length) as ArrayBuffer,
    '',
  )

  const { scale, rotationDeg, offset } = spec.model
  const root = gltf.scene
  root.scale.set(...scale)
  root.rotation.set(...(rotationDeg.map((d) => MathUtils.degToRad(d)) as [number, number, number]))
  root.position.set(...offset)
  const body = new Group()
  body.add(root)
  body.updateMatrixWorld(true)
  return body
}

/** Turns a bound node by `deg` about its axis, as AircraftView.animate does. */
function turn(node: Object3D, rest: Quaternion, axis: Vector3, deg: number) {
  node.quaternion
    .copy(rest)
    .multiply(new Quaternion().setFromAxisAngle(axis, MathUtils.degToRad(deg)))
  node.updateMatrixWorld(true)
}

/** Every vertex under `node`, in the body frame. */
function vertices(node: Object3D): Vector3[] {
  const out: Vector3[] = []
  node.updateMatrixWorld(true)
  node.traverse((o) => {
    if (!(o instanceof Mesh)) return
    const pos = o.geometry.attributes.position
    for (let i = 0; i < pos.count; i++)
      out.push(new Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld))
  })
  return out
}

function isUnder(o: Object3D, ancestor: Object3D): boolean {
  for (let p: Object3D | null = o; p; p = p.parent) if (p === ancestor) return true
  return false
}

describe.each(AIRCRAFT)('$name visual model binding', (spec) => {
  let body: Group
  const nodes = spec.model.nodes
  const find = (name: string) => {
    const node = body.getObjectByName(name)
    if (!node) throw new Error(`no node "${name}" in the model`)
    return node
  }

  beforeAll(async () => {
    body = await loadModel(spec)
  })

  it('binds a node for every surface deflection the sim reports', async () => {
    const sim = await createSimulation({ aircraft: spec })
    const keys = Object.keys(sim.telemetry().deflections).sort()
    expect(keys.length).toBeGreaterThan(0)
    expect(Object.keys(nodes.controls ?? {}).sort()).toEqual(keys)
    for (const c of Object.values(nodes.controls ?? {})) find(c.node)
  })

  it('moves each trailing edge towards -normal for positive deflection', () => {
    for (const [key, c] of Object.entries(nodes.controls ?? {})) {
      const name = key.split('.')[0]
      const surface = spec.surfaces.find((s) => s.controls?.some((k) => k.name === name))!
      // Down on wings and stabiliser, right on the fin (docs/agents/physics.md).
      const expected = surface.vertical ? new Vector3(1, 0, 0) : new Vector3(0, -1, 0)
      const node = find(c.node)
      const rest = node.quaternion.clone()
      const axis = new Vector3(...c.hingeAxis)

      // The trailing edge is the surface's most aft vertex. (The farthest from
      // the hinge can be a balance spade hung below it.)
      const aft = vertices(node).reduce((a, b) => (b.z > a.z ? b : a))
      const edge = node.worldToLocal(aft.clone())
      const before = node.localToWorld(edge.clone())
      turn(node, rest, axis, 10)
      const moved = node.localToWorld(edge.clone()).sub(before)
      turn(node, rest, axis, 0)

      expect(moved.length(), key).toBeGreaterThan(0.005)
      expect(moved.normalize().dot(expected), key).toBeGreaterThan(0.9)
    }
  })

  it('spins the propeller about the thrust line, in the spec direction', () => {
    const p = nodes.propeller!
    const node = find(p.node)
    const axis = new Vector3(...p.axis).applyQuaternion(node.getWorldQuaternion(new Quaternion()))
    // Positive turn about +thrust (body -z) is clockwise seen from behind.
    const thrust = new Vector3(0, 0, -1).multiplyScalar(spec.propeller.clockwiseFromBehind ? 1 : -1)
    expect(axis.dot(thrust)).toBeGreaterThan(0.999)

    const hub = node.getWorldPosition(new Vector3())
    expect(hub.distanceTo(new Vector3(...spec.propeller.position))).toBeLessThan(0.01)
    if (p.blades) expect(isUnder(find(p.blades), node)).toBe(true)
  })

  it('has one propeller: no static blades are left in the prop disc', () => {
    const prop = find(nodes.propeller!.node)
    const [, py, pz] = spec.propeller.position
    const radius = spec.propeller.diameter / 2
    const stray: Vector3[] = []
    body.traverse((o) => {
      if (!(o instanceof Mesh) || isUnder(o, prop)) return
      for (const v of vertices(o)) {
        const r = Math.hypot(v.x, v.y - py)
        if (Math.abs(v.z - pz) < 0.015 && r > 0.25 * radius && r < radius) stray.push(v)
      }
    })
    expect(stray).toEqual([])
  })
})
