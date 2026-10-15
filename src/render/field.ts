import {
  BoxGeometry,
  CylinderGeometry,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type Texture,
} from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import {
  abs,
  float,
  fract,
  mix,
  mx_noise_float,
  normalMap,
  positionWorld,
  smoothstep,
  texture,
  vec3,
} from 'three/tsl'
import { FIELD, terrainHeight } from '../sim/field'
import { Rng } from '../sim/rng'

async function loadTexture(url: string, srgb: boolean): Promise<Texture> {
  const t = await new TextureLoader().loadAsync(url)
  t.wrapS = t.wrapT = RepeatWrapping
  t.anisotropy = 8
  if (srgb) t.colorSpace = SRGBColorSpace
  return t
}

/** Terrain with mown runway stripes, the pilot station and the safety fence. */
export async function createField(segments: number): Promise<Group> {
  const group = new Group()
  group.name = 'field'

  const [diffuse, normals] = await Promise.all([
    loadTexture('assets/textures/leafy_grass_diff_1k.jpg', true),
    loadTexture('assets/textures/leafy_grass_nor_gl_1k.jpg', false),
  ])

  const geometry = new PlaneGeometry(FIELD.size, FIELD.size, segments, segments)
  geometry.rotateX(-Math.PI / 2)
  const pos = geometry.attributes.position!
  for (let i = 0; i < pos.count; i++) pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)))
  geometry.computeVertexNormals()

  const material = new MeshStandardNodeMaterial()
  const tileUv = positionWorld.xz.div(2.5)
  // Large-scale variation breaks up texture tiling; distant grass dries out.
  const macro = mx_noise_float(positionWorld.xz.mul(0.015)).mul(0.5).add(0.5)
  const detail = mx_noise_float(positionWorld.xz.mul(0.12)).mul(0.5).add(0.5)
  // The texture's brightness carries the blade/clump detail; the colour comes
  // from a grass palette so the leaf litter in the photo doesn't read brown.
  const luminance = texture(diffuse, tileUv).rgb.dot(vec3(0.3, 0.59, 0.11))
  const palette = mix(
    vec3(0.13, 0.26, 0.05),
    vec3(0.22, 0.36, 0.08),
    macro.mul(0.7).add(detail.mul(0.3)),
  )
  const grass = palette.mul(luminance.mul(2.4))
  const dry = grass.mul(vec3(1.25, 1.1, 0.7))
  const distance = positionWorld.xz.length()
  let color = mix(
    grass,
    dry,
    smoothstep(FIELD.flatRadius * 0.6, FIELD.hillRadius, distance).mul(macro),
  )

  // Mown runway: lighter, with alternating mowing stripes along its length.
  const halfL = FIELD.runway.length / 2
  const halfW = FIELD.runway.width / 2
  const inRunway = smoothstep(halfL + 1, halfL, abs(positionWorld.x)).mul(
    smoothstep(halfW + 0.6, halfW, abs(positionWorld.z)),
  )
  const stripe = smoothstep(0.45, 0.55, fract(positionWorld.z.div(3.5)))
  const mown = color.mul(vec3(1.08, 1.14, 0.95)).mul(mix(float(0.92), float(1.1), stripe))
  color = mix(color, mown, inRunway)

  // Pilot station pad: worn grass around the pilots' boxes.
  const pad = smoothstep(
    7,
    4,
    positionWorld.sub(vec3(FIELD.pilotStation.x, 0, FIELD.pilotStation.z)).xz.length(),
  )
  color = mix(color, color.mul(vec3(1.15, 1.08, 0.82)), pad.mul(0.6))

  material.colorNode = color
  material.normalNode = normalMap(texture(normals, tileUv))
  material.roughnessNode = float(0.95)

  const ground = new Mesh(geometry, material)
  ground.receiveShadow = true
  ground.name = 'terrain'
  group.add(ground)

  group.add(await createFence())
  return group
}

/**
 * Post-and-rail safety fence: round weathered posts, each leaning a little,
 * with split rails spanning post to post on the runway side.
 */
async function createFence(): Promise<Group> {
  const fence = new Group()
  const [map, normals, roughness] = await Promise.all([
    loadTexture('assets/textures/rough_wood_diff_1k.jpg', true),
    loadTexture('assets/textures/rough_wood_nor_gl_1k.jpg', false),
    loadTexture('assets/textures/rough_wood_rough_1k.jpg', false),
  ])
  const wood = new MeshStandardNodeMaterial({ map, normalMap: normals, roughnessMap: roughness })
  const { z, halfLength } = FIELD.fence
  const spacing = 2.5
  const count = Math.floor((halfLength * 2) / spacing) + 1
  const rng = new Rng(17)

  const postHeight = 1.3
  const postGeometry = new CylinderGeometry(0.06, 0.075, postHeight, 12, 1)
  postGeometry.translate(0, postHeight / 2 - 0.15, 0)
  const posts = new InstancedMesh(postGeometry, wood, count)

  // A split rail: wider than deep, grain along its length.
  const railGeometry = new BoxGeometry(spacing + 0.12, 0.1, 0.05)
  const uv = railGeometry.attributes.uv!
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * 0.15, uv.getX(i) * 2.5)
  const rails = new InstancedMesh(railGeometry, wood, (count - 1) * 2)

  const m = new Matrix4()
  const q = new Quaternion()
  const e = new Euler()
  const tops: Vector3[] = []
  for (let i = 0; i < count; i++) {
    const x = -halfLength + i * spacing + rng.range(-0.06, 0.06)
    const lean = new Euler(
      rng.range(-0.025, 0.025),
      rng.range(0, Math.PI * 2),
      rng.range(-0.025, 0.025),
    )
    const base = new Vector3(x, terrainHeight(x, z), z)
    posts.setMatrixAt(
      i,
      m.compose(base, q.setFromEuler(lean), new Vector3(1, rng.range(0.96, 1.04), 1)),
    )
    tops.push(base)
  }
  let r = 0
  for (let i = 0; i < count - 1; i++) {
    const a = tops[i]!
    const b = tops[i + 1]!
    for (const height of [0.5, 0.98]) {
      const mid = new Vector3().addVectors(a, b).multiplyScalar(0.5)
      mid.y += height + rng.range(-0.025, 0.025)
      mid.z -= 0.09
      e.set(
        rng.range(-0.06, 0.06),
        rng.range(-0.01, 0.01),
        Math.atan2(b.y - a.y, b.x - a.x) + rng.range(-0.012, 0.012),
      )
      rails.setMatrixAt(r++, m.compose(mid, q.setFromEuler(e), new Vector3(1, 1, 1)))
    }
  }
  posts.castShadow = posts.receiveShadow = true
  rails.castShadow = rails.receiveShadow = true
  fence.add(posts, rails)
  return fence
}
