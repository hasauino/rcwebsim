/**
 * Downloads the hangar's props and surface textures and makes the shipped
 * copies in public/assets/hangar/: each prop scaled to its real size in
 * metres, standing on its origin (bottom centre), brand logos painted out,
 * textures resized and WebP-encoded, geometry meshopt-compressed.
 *
 * Poly Haven (CC0) downloads freely. Sketchfab needs an account's API token,
 * read from SKETCHFAB_TOKEN or ~/.config/sketchfab/token. Downloads are kept
 * in .cache/hangar/ so a re-run only re-processes.
 *
 * Usage (Node 22.18+ runs TypeScript directly):
 *     node scripts/hangar-assets.ts           # everything
 *     node scripts/hangar-assets.ts lipo bike # just these
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { NodeIO, type Document, type Texture } from '@gltf-transform/core'
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions'
import {
  dedup,
  flatten,
  getBounds,
  join as joinMeshes,
  prune,
  quantize,
  reorder,
  simplify,
  textureCompress,
  weld,
} from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import sharp from 'sharp'
import {
  PROPS,
  SURFACES,
  type HangarLicense,
  type PropId,
  type SurfaceId,
} from '../src/render/hangar/props.ts'

type Rect = [x0: number, y0: number, x1: number, y1: number]

interface Delogo {
  /** Index into the document's texture list. */
  texture: number
  rects: Rect[]
  /**
   * How each rectangle is filled: `rows` blends each row from the pixels just
   * left of it to those just right of it (keeps a scan's shading); a colour
   * is a flat fill.
   */
  fill: 'rows' | [number, number, number]
}

interface Source {
  polyHaven?: string
  sketchfab?: string
  /** Scale so this extent is this many metres; omitted, the source is in metres. */
  fit?: { axis: 'x' | 'y' | 'z' | 'max'; metres: number }
  /** Longest base colour texture side after resizing, px; other maps get half. */
  texture?: number
  /** Fraction of triangles to keep. */
  simplify?: number
  delogo?: Delogo[]
  /** Materials whose triangles are removed, e.g. a backdrop the author modelled in. */
  drop?: string[]
  /** Materials repainted a plain colour (their textures dropped). */
  repaint?: Record<string, [number, number, number]>
}

const SOURCES: Record<PropId, Source> = {
  workbench: { sketchfab: '9fbc30ba31a546fe9370e6de2dcc0707', texture: 1024 },
  transmitter: {
    sketchfab: 'd504e7e818d9426d9b5beba1ef04fc8e',
    fit: { axis: 'x', metres: 0.21 },
    simplify: 0.25,
    // Maker's logo, model name and recycling mark on the case.
    delogo: [
      {
        texture: 6,
        rects: [
          [10, 20, 290, 135],
          [660, 130, 750, 205],
        ],
        fill: [17, 20, 26],
      },
    ],
  },
  printer: {
    sketchfab: 'd467426e08b14662906f614762f832ef',
    fit: { axis: 'y', metres: 0.6 },
    repaint: { printer_logo: [0.02, 0.02, 0.02] },
  },
  lipo: {
    sketchfab: '2279697ec4b44d75813fd365d96a4e07',
    fit: { axis: 'max', metres: 0.18 },
    drop: ['floor'],
    // The maker's logo on the label.
    delogo: [{ texture: 0, rects: [[121, 742, 212, 797]], fill: [8, 8, 8] }],
  },
  'lipo-bag': { sketchfab: 'f5356b9d5d2c4b318b403065b5f1e1cc', fit: { axis: 'max', metres: 0.22 } },
  'ca-glue': { sketchfab: '8f0bafffc2c5482c88367cc5df3351c9', fit: { axis: 'y', metres: 0.08 } },
  'soldering-iron': { sketchfab: 'a3f97e628e6f49678bc44158767ee31a' },
  bike: { sketchfab: '4cc719f387cb4cb4aea6e12a27e06e2e', fit: { axis: 'max', metres: 1.75 } },
  'shop-vac': {
    sketchfab: '05c538e10ac942a19ab7d3812545c5db',
    texture: 1024,
    // The maker's name down the side.
    delogo: [{ texture: 0, rects: [[752, 398, 822, 588]], fill: 'rows' }],
  },
  'hobby-knife': {
    sketchfab: 'cd4d902eec314a419adde15d9e985877',
    fit: { axis: 'max', metres: 0.16 },
  },
  'cutting-mat': {
    sketchfab: 'cad3fdbcdae14e9386f65e1d5d551f74',
    fit: { axis: 'max', metres: 0.45 },
    texture: 1024,
  },
  servo: { sketchfab: 'b458dc2d20134a609af1e06698abfe18' },
  'tool-chest': { polyHaven: 'metal_tool_chest', simplify: 0.5 },
  // Poly Haven's glTF of these is in decimetres.
  shelves: {
    polyHaven: 'steel_frame_shelves_01',
    fit: { axis: 'y', metres: 2.141 },
    texture: 1024,
  },
  'crate-milk': { polyHaven: 'plastic_crate_01', simplify: 0.4 },
  'crate-stack': { polyHaven: 'plastic_crate_03', simplify: 0.4 },
  'cardboard-box': { polyHaven: 'cardboard_box_01', simplify: 0.4 },
  'flight-box': { polyHaven: 'metal_toolbox', simplify: 0.5 },
  pliers: { polyHaven: 'pliers', texture: 256 },
  screwdrivers: { polyHaven: 'screwdrivers_02', texture: 256 },
  'adjustable-wrench': { polyHaven: 'adjustable_wrench', texture: 256 },
  'combination-wrench': { polyHaven: 'combination_wrench', texture: 256 },
  hammer: { polyHaven: 'wooden_hammer_01', texture: 256 },
  handsaw: { polyHaven: 'handsaw_wood', texture: 256 },
  'tape-measure': { polyHaven: 'measuring_tape_01', texture: 256 },
  drill: { polyHaven: 'Drill_01', texture: 256 },
  multimeter: { polyHaven: 'retro_multimeter', texture: 256 },
  'desk-lamp': { polyHaven: 'desk_lamp_arm_01', simplify: 0.4 },
  stool: { polyHaven: 'wooden_stool_01' },
  extinguisher: { polyHaven: 'korean_fire_extinguisher_01' },
  'spray-paint': { polyHaven: 'spray_paint_bottles', texture: 256 },
  'lubricant-spray': { polyHaven: 'lubricant_spray', texture: 256 },
  'garden-hose': { polyHaven: 'garden_hose_wall_mounted_01' },
  spade: { polyHaven: 'rusted_spade_01' },
  'watering-can': { polyHaven: 'watering_can_metal_01' },
  barrel: { polyHaven: 'Barrel_02' },
  ladder: { polyHaven: 'ladder_sectioned_01', simplify: 0.4 },
  'tire-pump': { polyHaven: 'tire_pump', texture: 256 },
  'planter-box': { polyHaven: 'planter_box_01' },
  'ceiling-light': { polyHaven: 'mounted_fluorescent_lights', texture: 256 },
}

/** Poly Haven texture slug for each surface, and its colour map's side to ship. */
const SURFACE_SOURCES: Record<SurfaceId, { slug: string; size: number }> = {
  floor: { slug: 'garage_floor', size: 1024 },
  plaster: { slug: 'painted_plaster_wall', size: 1024 },
  brick: { slug: 'painted_brick', size: 1024 },
  shutter: { slug: 'painted_metal_shutter', size: 512 },
  driveway: { slug: 'concrete_floor_01', size: 512 },
  lawn: { slug: 'leafy_grass', size: 512 },
}

const CACHE = '.cache/hangar'
const OUT = 'public/assets/hangar'
const DEFAULT_TEXTURE = 512

async function fetchOk(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`)
  return res
}

async function download(url: string, path: string, init?: RequestInit): Promise<void> {
  if (existsSync(path)) return
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, Buffer.from(await (await fetchOk(url, init)).arrayBuffer()))
}

function sketchfabToken(): string {
  const env = process.env.SKETCHFAB_TOKEN
  if (env) return env.trim()
  const file = join(homedir(), '.config/sketchfab/token')
  if (existsSync(file)) return readFileSync(file, 'utf8').trim()
  throw new Error('Sketchfab needs an API token: set SKETCHFAB_TOKEN or ~/.config/sketchfab/token')
}

/** The 1k glTF and everything it references; resolves to the .gltf path. */
async function fetchPolyHaven(slug: string): Promise<string> {
  const files = (await (await fetchOk(`https://api.polyhaven.com/files/${slug}`)).json()) as {
    gltf: { '1k': { gltf: { url: string; include: Record<string, { url: string }> } } }
  }
  const gltf = files.gltf['1k'].gltf
  const dir = join(CACHE, 'polyhaven', slug)
  const path = join(dir, `${slug}.gltf`)
  await download(gltf.url, path)
  for (const [rel, { url }] of Object.entries(gltf.include)) await download(url, join(dir, rel))
  return path
}

async function fetchSketchfab(uid: string): Promise<string> {
  const path = join(CACHE, 'sketchfab', `${uid}.glb`)
  if (existsSync(path)) return path
  const auth = { headers: { Authorization: `Token ${sketchfabToken()}` } }
  const res = await fetchOk(`https://api.sketchfab.com/v3/models/${uid}/download`, auth)
  const links = (await res.json()) as { glb?: { url: string } }
  if (!links.glb) throw new Error(`Sketchfab ${uid} offers no .glb download`)
  await download(links.glb.url, path)
  return path
}

async function paintOut(texture: Texture, { rects, fill }: Delogo): Promise<void> {
  const { data, info } = await sharp(texture.getImage()!)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width, channels } = info
  const at = (x: number, y: number) => (y * width + x) * channels
  for (const [x0, y0, x1, y1] of rects)
    for (let y = y0; y < y1; y++) {
      // Edge colours, averaged over 3 px each side.
      const edge = (from: number, step: number) =>
        [0, 1, 2].map((c) => {
          let sum = 0
          for (let i = 0; i < 3; i++) sum += data[at(from + i * step, y) + c]!
          return sum / 3
        })
      const left = fill === 'rows' ? edge(x0 - 1, -1) : fill
      const right = fill === 'rows' ? edge(x1, 1) : fill
      for (let x = x0; x < x1; x++) {
        const t = (x - x0) / Math.max(1, x1 - x0 - 1)
        for (let c = 0; c < 3; c++) data[at(x, y) + c] = left[c]! + (right[c]! - left[c]!) * t
      }
    }
  const png = await sharp(data, { raw: info }).png().toBuffer()
  texture.setImage(new Uint8Array(png)).setMimeType('image/png')
}

/** Props never animate: drop skins so each mesh rests where its node puts it. */
function unskin(doc: Document): void {
  for (const node of doc.getRoot().listNodes()) node.setSkin(null)
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives())
      for (const semantic of prim.listSemantics())
        if (/^(JOINTS|WEIGHTS)_/.test(semantic)) prim.setAttribute(semantic, null)
}

/** Scales to the spec's size and stands the model on its origin. */
function place(doc: Document, fit: Source['fit']): void {
  const scene = doc.getRoot().listScenes()[0]!
  const { min, max } = getBounds(scene)
  const size = max.map((v, i) => v - min[i]!)
  const extent = !fit
    ? 1
    : fit.axis === 'max'
      ? Math.max(...size)
      : size[{ x: 0, y: 1, z: 2 }[fit.axis]]!
  const s = fit ? fit.metres / extent : 1
  const root = doc.createNode('root').setScale([s, s, s])
  root.setTranslation([
    (-(min[0]! + max[0]!) / 2) * s,
    -min[1]! * s,
    (-(min[2]! + max[2]!) / 2) * s,
  ])
  for (const child of scene.listChildren()) {
    scene.removeChild(child)
    root.addChild(child)
  }
  scene.addChild(root)
}

/** Sketchfab's licence slugs, as the catalogue writes them. */
const SKETCHFAB_LICENSES: Record<string, HangarLicense> = {
  cc0: 'CC0',
  by: 'CC-BY 4.0',
  'by-sa': 'CC-BY-SA 4.0',
}

/** Fails unless the model is still published under the licence we credit. */
async function checkLicense(id: PropId, uid: string): Promise<void> {
  const res = await fetchOk(`https://api.sketchfab.com/v3/models/${uid}`)
  const { license } = (await res.json()) as { license: { slug: string } }
  if (SKETCHFAB_LICENSES[license.slug] !== PROPS[id].license)
    throw new Error(`${id}: Sketchfab says ${license.slug}, the catalogue ${PROPS[id].license}`)
}

async function processProp(id: PropId, io: NodeIO): Promise<void> {
  const src = SOURCES[id]
  if (src.sketchfab) await checkLicense(id, src.sketchfab)
  const path = src.polyHaven
    ? await fetchPolyHaven(src.polyHaven)
    : await fetchSketchfab(src.sketchfab!)
  const doc = await io.read(path)
  const textures = doc.getRoot().listTextures()
  for (const d of src.delogo ?? []) await paintOut(textures[d.texture]!, d)
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives())
      if (src.drop?.includes(prim.getMaterial()?.getName() ?? '')) prim.dispose()
  for (const m of doc.getRoot().listMaterials()) {
    const colour = src.repaint?.[m.getName()]
    if (colour) m.setBaseColorTexture(null).setBaseColorFactor([...colour, 1])
  }
  unskin(doc)
  place(doc, src.fit)
  const size = src.texture ?? DEFAULT_TEXTURE
  await doc.transform(
    dedup(),
    flatten(),
    joinMeshes(),
    weld(),
    ...(src.simplify
      ? [simplify({ simplifier: MeshoptSimplifier, ratio: src.simplify, error: 0.0005 })]
      : []),
    prune(),
    // Normal, roughness and occlusion detail survives at half the colour's size.
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      slots: /^(?!baseColor)/,
      resize: [size / 2, size / 2],
      quality: 75,
    }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: 75 }),
    reorder({ encoder: MeshoptEncoder }),
    quantize(),
  )
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })
  const out = join(OUT, `${id}.glb`)
  mkdirSync(OUT, { recursive: true })
  writeFileSync(out, await io.writeBinary(doc))
  const { min, max } = getBounds(doc.getRoot().listScenes()[0]!)
  const dims = max.map((v, i) => (v - min[i]!).toFixed(3)).join(' × ')
  console.log(`${id}: ${dims} m, ${(readFileSync(out).byteLength / 1024).toFixed(0)} KB`)
}

/** Base colour, normal and AO/roughness/metalness maps of one surface. */
async function processSurface(id: SurfaceId): Promise<void> {
  const { slug, size } = SURFACE_SOURCES[id]
  const files = (await (await fetchOk(`https://api.polyhaven.com/files/${slug}`)).json()) as Record<
    string,
    Record<string, { jpg?: { url: string }; png?: { url: string } }>
  >
  const maps = { diff: 'Diffuse', nor: 'nor_gl', arm: 'arm' } as const
  for (const [map, key] of Object.entries(maps)) {
    const file = files[key]?.['1k']
    const url = file?.jpg?.url ?? file?.png?.url
    if (!url) throw new Error(`${slug} has no 1k ${key}`)
    const cached = join(CACHE, 'textures', `${slug}_${map}${url.slice(url.lastIndexOf('.'))}`)
    await download(url, cached)
    const out = join(OUT, 'textures', `${id}_${map}.webp`)
    mkdirSync(dirname(out), { recursive: true })
    // As with the props: detail maps at half the colour's size.
    const side = map === 'diff' ? size : size / 2
    await sharp(cached).resize(side, side).webp({ quality: 75 }).toFile(out)
  }
  console.log(`${id}: ${slug}`)
}

await MeshoptDecoder.ready
await MeshoptEncoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
})
const only = process.argv.slice(2)
const pick = <T extends string>(ids: T[]) =>
  only.length ? ids.filter((i) => only.includes(i)) : ids
for (const id of pick(Object.keys(SURFACES) as SurfaceId[])) await processSurface(id)
for (const id of pick(Object.keys(PROPS) as PropId[])) await processProp(id, io)
