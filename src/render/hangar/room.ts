import {
  BoxGeometry,
  CircleGeometry,
  Group,
  Mesh,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Texture,
} from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { color, luminance, texture, vec3 } from 'three/tsl'
import { Rng } from '../../sim/rng'
import { Grove, growVariants, type TreeVariant } from '../trees'
import type { Box } from './orbit'
import { surfaceUrl, type SurfaceId } from './props'

/** Inside of the garage, metres: +x right, +y up, the open door on +z. */
export const ROOM = {
  width: 6,
  depth: 6.5,
  height: 2.6,
  wall: 0.2,
  door: { width: 4.8, height: 2.2 },
  /** The side window, in the right wall: z span and sill/head heights. */
  window: { z0: -1.7, z1: -0.3, y0: 1.0, y1: 1.95 },
} as const

const X = ROOM.width / 2
const Z = ROOM.depth / 2

/** The inside of the room, for keeping the camera in. */
export const ROOM_BOX: Box = { min: [-X, 0, -Z], max: [X, ROOM.height, Z] }

const loader = new TextureLoader()

function load(url: string, color: boolean, repeat: Vector2): Promise<Texture> {
  return loader.loadAsync(url).then((t) => {
    t.wrapS = t.wrapT = RepeatWrapping
    t.repeat.copy(repeat)
    t.anisotropy = 8
    if (color) t.colorSpace = SRGBColorSpace
    return t
  })
}

/**
 * A scanned PBR surface: base colour, normal, and AO/roughness/metalness
 * packed in one map. It shows plain `tint` until its textures arrive, and
 * `tint` multiplies them after; `repaint` instead keeps only the scan's
 * light and dark, on `tint` (a fresh coat of paint over the same wear).
 * Geometry UVs are in metres; `tile` is how many metres one copy covers.
 */
function surface(
  id: SurfaceId,
  tile: number,
  tint: number,
  pending: Promise<unknown>[],
  repaint = false,
): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ color: tint, roughness: 0.85 })
  const repeat = new Vector2(1 / tile, 1 / tile)
  pending.push(
    Promise.all([
      load(surfaceUrl(id, 'diff'), true, repeat),
      load(surfaceUrl(id, 'nor'), false, repeat),
      load(surfaceUrl(id, 'arm'), false, repeat),
    ])
      .then(([diff, nor, arm]) => {
        if (repaint)
          material.colorNode = color(tint).mul(luminance(texture(diff).rgb).mul(0.9).add(0.45))
        else material.map = diff
        material.normalMap = nor
        material.aoMap = material.roughnessMap = material.metalnessMap = arm
        material.roughness = 1
        material.metalness = 1
        material.needsUpdate = true
      })
      .catch(() => {
        // The plain tint stands in.
      }),
  )
  return material
}

/** A box between two corners whose UVs run in metres on every face. */
function slab(min: [number, number, number], max: [number, number, number]): BufferGeometry {
  const size = new Vector3(max[0] - min[0], max[1] - min[1], max[2] - min[2])
  const g = new BoxGeometry(size.x, size.y, size.z)
  // Faces in order +x, -x, +y, -y, +z, -z; each spans two of the box's sides.
  const spans: [number, number][] = [
    [size.z, size.y],
    [size.z, size.y],
    [size.x, size.z],
    [size.x, size.z],
    [size.x, size.y],
    [size.x, size.y],
  ]
  const uv = g.attributes.uv!
  // Offset by the world corner so neighbouring slabs continue the pattern.
  for (let face = 0; face < 6; face++) {
    const [u, v] = spans[face]!
    const [ou, ov] = face < 2 ? [min[2], min[1]] : face < 4 ? [min[0], min[2]] : [min[0], min[1]]
    for (let i = face * 4; i < face * 4 + 4; i++)
      uv.setXY(i, uv.getX(i) * u + ou, uv.getY(i) * v + ov)
  }
  g.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2)
  return g
}

function mesh(geometry: BufferGeometry, material: MeshStandardNodeMaterial, cast = true): Mesh {
  const m = new Mesh(geometry, material)
  m.castShadow = cast
  m.receiveShadow = true
  return m
}

export interface Room {
  group: Group
  /** Resolves once every surface texture has loaded or failed. */
  ready: Promise<void>
}

/**
 * The garage shell: concrete floor, plaster walls with a painted-brick back
 * wall, the open door with its rolled-up shutter, the side window, and the
 * driveway and lawn outside.
 */
export function createRoom(): Room {
  const pending: Promise<unknown>[] = []
  const group = new Group()
  group.name = 'room'
  const T = ROOM.wall
  const H = ROOM.height
  const { door, window: win } = ROOM

  const floor = surface('floor', 2.2, 0xc9c7c2, pending, true)
  const plaster = surface('plaster', 2, 0xf3eee4, pending, true)
  const brick = surface('brick', 1.8, 0xc4ecdf, pending)
  const shutter = surface('shutter', 1.2, 0xf2f2ee, pending)
  const driveway = surface('driveway', 2.5, 0xd9d5cc, pending, true)
  const trim = new MeshStandardNodeMaterial({ color: 0xf6f4ee, roughness: 0.55 })

  group.add(mesh(slab([-X - T, -0.12, -Z - T], [X + T, 0, Z + T]), floor, false))
  group.add(mesh(slab([-X - T, H, -Z - T], [X + T, H + 0.15, Z + T]), plaster))
  // Back wall, left wall.
  group.add(mesh(slab([-X - T, 0, -Z - T], [X + T, H, -Z]), brick))
  group.add(mesh(slab([-X - T, 0, -Z], [-X, H, Z]), plaster))
  // Right wall, around the window.
  group.add(mesh(slab([X, 0, -Z], [X + T, H, win.z0]), plaster))
  group.add(mesh(slab([X, 0, win.z1], [X + T, H, Z]), plaster))
  group.add(mesh(slab([X, 0, win.z0], [X + T, win.y0, win.z1]), plaster))
  group.add(mesh(slab([X, win.y1, win.z0], [X + T, H, win.z1]), plaster))
  // Front wall, around the door.
  const dx = door.width / 2
  group.add(mesh(slab([-X - T, 0, Z], [-dx, H, Z + T]), plaster))
  group.add(mesh(slab([dx, 0, Z], [X + T, H, Z + T]), plaster))
  group.add(mesh(slab([-dx, door.height, Z], [dx, H, Z + T]), plaster))

  // The shutter rolled up in a painted box above the opening, its bottom rail showing.
  group.add(mesh(slab([-dx - 0.05, door.height + 0.04, Z - 0.3], [dx + 0.05, H - 0.02, Z]), trim))
  group.add(mesh(slab([-dx, door.height - 0.05, Z - 0.05], [dx, door.height + 0.04, Z]), shutter))

  // Window frame and glazing bars, painted white.
  const frame = 0.05
  const bars: [number, number, number, number][] = [
    [win.y0, win.y0 + frame, win.z0, win.z1],
    [win.y1 - frame, win.y1, win.z0, win.z1],
    [win.y0, win.y1, win.z0, win.z0 + frame],
    [win.y0, win.y1, win.z1 - frame, win.z1],
    [(win.y0 + win.y1) / 2 - 0.02, (win.y0 + win.y1) / 2 + 0.02, win.z0, win.z1],
  ]
  const panes = 3
  for (let i = 1; i < panes; i++) {
    const z = win.z0 + ((win.z1 - win.z0) * i) / panes
    bars.push([win.y0, win.y1, z - 0.02, z + 0.02])
  }
  for (const [y0, y1, z0, z1] of bars)
    group.add(mesh(slab([X + 0.06, y0, z0], [X + 0.12, y1, z1]), trim))

  // Skirting along the plaster walls.
  group.add(mesh(slab([-X, 0, -Z], [-X + 0.015, 0.1, Z]), trim, false))
  group.add(mesh(slab([X - 0.015, 0, -Z], [X, 0.1, Z]), trim, false))

  // Outside: the driveway out of the door, lawn all round.
  group.add(mesh(slab([-dx - 0.6, -0.1, Z + T], [dx + 0.6, -0.005, Z + 14]), driveway, false))
  const grass = new MeshStandardNodeMaterial({ color: 0xffffff, roughness: 1 })
  const grassRepeat = new Vector2(60, 60)
  pending.push(
    Promise.all([
      load(surfaceUrl('lawn', 'diff'), true, grassRepeat),
      load(surfaceUrl('lawn', 'nor'), false, grassRepeat),
    ])
      .then(([diff, nor]) => {
        // Fresh green: the scan's leaf litter reads as bare earth from the garage.
        grass.colorNode = texture(diff).rgb.mul(vec3(0.85, 1.25, 0.6))
        grass.normalMap = nor
        grass.needsUpdate = true
      })
      .catch(() => {
        grass.color.set(0x5f7d3c)
      }),
  )
  const lawn = new Mesh(new CircleGeometry(160, 48), grass)
  lawn.rotation.x = -Math.PI / 2
  lawn.position.y = -0.02
  lawn.receiveShadow = true
  group.add(lawn)

  return { group, ready: Promise.all(pending).then(() => undefined) }
}

/**
 * The garden seen through the door and window: a hedge across the end of
 * the drive and down the side, and a few trees. Grown with the field's
 * trees, so it arrives last.
 */
export async function createGarden(): Promise<Group> {
  const variants = await growVariants()
  const rng = new Rng(7)
  const grove = new Grove(rng)
  const place = (variant: TreeVariant, x: number, z: number, height: number) =>
    grove.plant(variant, x, -0.1, z, height)
  // Hedge across the end of the drive, and along the right-hand boundary.
  for (let x = -26; x <= 26; x += 1.6)
    place(
      variants.bush[Math.abs(Math.round(x)) % 2]!,
      x + rng.range(-0.3, 0.3),
      Z + 16,
      rng.range(1.6, 2.2),
    )
  for (let z = -8; z < Z + 16; z += 1.6)
    place(
      variants.bush[Math.abs(Math.round(z)) % 2]!,
      X + 9 + rng.range(-0.3, 0.3),
      z,
      rng.range(1.5, 2),
    )
  place(variants.oak[0]!, -9, Z + 22, 11)
  place(variants.oak[1]!, 10, Z + 26, 13)
  place(variants.ash[0]!, 22, Z + 6, 12)
  place(variants.oak[1]!, -24, Z + 10, 10)
  return grove.build('garden', false)
}
