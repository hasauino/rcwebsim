import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
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

  group.add(createFence())
  return group
}

/** Post-and-rail safety fence between the pilots and the runway. */
function createFence(): Group {
  const fence = new Group()
  const wood = new MeshStandardNodeMaterial({ color: 0x8a7458, roughness: 0.9 })
  const { z, halfLength } = FIELD.fence
  const spacing = 2.5
  const count = Math.floor((halfLength * 2) / spacing) + 1
  const posts = new InstancedMesh(new BoxGeometry(0.1, 1.1, 0.1), wood, count)
  const m = new Matrix4()
  for (let i = 0; i < count; i++) {
    const x = -halfLength + i * spacing
    posts.setMatrixAt(i, m.makeTranslation(x, terrainHeight(x, z) + 0.55, z))
  }
  posts.castShadow = posts.receiveShadow = true
  fence.add(posts)
  for (const height of [0.5, 1.0]) {
    const rail = new Mesh(new BoxGeometry(halfLength * 2, 0.08, 0.04), wood)
    rail.position.set(0, height, z)
    rail.castShadow = true
    fence.add(rail)
  }
  return fence
}
