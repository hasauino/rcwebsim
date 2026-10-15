import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import {
  mix,
  normalViewGeometry,
  positionLocal,
  positionWorld,
  sin,
  time,
  uv,
  vec3,
} from 'three/tsl'
import { FIELD, terrainHeight } from '../sim/field'
import { Rng } from '../sim/rng'

/** A tapered three-segment blade, 1 m tall before instance scaling. */
function bladeGeometry(): BufferGeometry {
  const w = 0.05
  // prettier-ignore
  const positions = [
    -w, 0, 0, w, 0, 0, -w * 0.7, 0.4, 0,
    w, 0, 0, w * 0.7, 0.4, 0, -w * 0.7, 0.4, 0,
    -w * 0.7, 0.4, 0, w * 0.7, 0.4, 0, 0, 1, 0,
  ]
  const uvs = [0, 0, 1, 0, 0, 0.4, 1, 0, 1, 0.4, 0, 0.4, 0, 0.4, 1, 0.4, 0.5, 1]
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(positions, 3))
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  g.setAttribute(
    'normal',
    new Float32BufferAttribute(
      positions.map((_, i) => (i % 3 === 1 ? 1 : 0)),
      3,
    ),
  )
  return g
}

/**
 * Instanced grass blades scattered densest around the pilot station, where
 * the camera is close to the ground. Blades sway in the wind on the GPU.
 */
export function createGrass(count: number): InstancedMesh {
  const material = new MeshStandardNodeMaterial({ side: DoubleSide, roughness: 0.9 })
  const height = uv().y
  const sway = sin(time.mul(1.7).add(positionWorld.x.mul(0.35)).add(positionWorld.z.mul(0.21)))
  material.positionNode = positionLocal.add(vec3(sway.mul(height.mul(height)).mul(0.08), 0, 0))
  material.colorNode = mix(vec3(0.07, 0.13, 0.03), vec3(0.2, 0.32, 0.08), height)
  // Light both faces like the ground they grow from (geometry normals point
  // up); otherwise every back face is lit from below and renders black.
  material.normalNode = normalViewGeometry

  const mesh = new InstancedMesh(bladeGeometry(), material, count)
  const rng = new Rng(3)
  const m = new Matrix4()
  const q = new Quaternion()
  const up = new Vector3(0, 1, 0)
  const { x: px, z: pz } = FIELD.pilotStation
  for (let i = 0; i < count; i++) {
    // Density falls off with distance from the pilot (r ~ sqrt for even area, squared for falloff).
    const r = 2 + 70 * rng.next() ** 2
    const a = rng.range(0, Math.PI * 2)
    const x = px + Math.cos(a) * r
    const z = pz + Math.sin(a) * r
    // The runway is mown short.
    const mown = Math.abs(x) < FIELD.runway.length / 2 && Math.abs(z) < FIELD.runway.width / 2 + 0.5
    const s = rng.range(0.08, 0.2) * (mown ? 0.3 : 1)
    q.setFromAxisAngle(up, rng.range(0, Math.PI))
    m.compose(new Vector3(x, terrainHeight(x, z), z), q, new Vector3(s * 1.5, s, s))
    mesh.setMatrixAt(i, m)
  }
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  mesh.name = 'grass'
  return mesh
}
