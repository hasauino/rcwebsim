/**
 * Every model and texture the hangar shows, with its credit. Each prop ships
 * as `assets/hangar/<id>.glb`, made from the download by
 * `scripts/hangar-assets.ts`; textures ship under `assets/hangar/textures/`.
 * Only licences that allow changes and commercial use are accepted.
 */

export type HangarLicense = 'CC0' | 'CC-BY 4.0' | 'CC-BY-SA 4.0'

export const ALLOWED_LICENSES: readonly HangarLicense[] = ['CC0', 'CC-BY 4.0', 'CC-BY-SA 4.0']

export interface HangarCredit {
  title: string
  author: string
  license: HangarLicense
  /** The page it was downloaded from. */
  url: string
}

const polyHaven = (slug: string, title: string, author: string): HangarCredit => ({
  title,
  author,
  license: 'CC0',
  url: `https://polyhaven.com/a/${slug}`,
})

const sketchfab = (slug: string, title: string, author: string): HangarCredit => ({
  title,
  author,
  license: 'CC-BY 4.0',
  url: `https://sketchfab.com/3d-models/${slug}`,
})

export const PROPS = {
  workbench: sketchfab(
    'old-work-bench-9fbc30ba31a546fe9370e6de2dcc0707',
    'Old Work Bench',
    'Oliver Triplett',
  ),
  transmitter: sketchfab(
    'radio-controller-d504e7e818d9426d9b5beba1ef04fc8e',
    'radio controller',
    'ASHISH',
  ),
  printer: sketchfab(
    'lowpoly-3d-printer-based-on-creality-ender3-d467426e08b14662906f614762f832ef',
    'Lowpoly 3d printer based on creality ender3',
    'B._.render',
  ),
  lipo: sketchfab(
    'drone-lipo-battery-4s-2279697ec4b44d75813fd365d96a4e07',
    'Drone_Lipo_battery_4s',
    '3dArenaRaj',
  ),
  'lipo-bag': sketchfab(
    'lipo-battery-safe-bag-f5356b9d5d2c4b318b403065b5f1e1cc',
    'Lipo Battery Safe Bag',
    'DrawingDoom',
  ),
  'ca-glue': sketchfab('glue-bottle-8f0bafffc2c5482c88367cc5df3351c9', 'Glue Bottle', 'kilansky'),
  'soldering-iron': sketchfab(
    'soldering-iron-60w-adjustable-temprature-a3f97e628e6f49678bc44158767ee31a',
    'Soldering Iron 60W Adjustable Temprature',
    'yarankepang',
  ),
  bike: sketchfab(
    'yellow-bicycle-4cc719f387cb4cb4aea6e12a27e06e2e',
    'Yellow bicycle',
    'Tatyana Volkova',
  ),
  'shop-vac': sketchfab(
    'shop-vacuum-scan-lowpoly-05c538e10ac942a19ab7d3812545c5db',
    'Shop Vacuum scan LOWPOLY',
    'sixonetwo',
  ),
  'hobby-knife': sketchfab(
    'box-cutterutility-knife-gameready-cd4d902eec314a419adde15d9e985877',
    'Box cutter/Utility knife Gameready',
    'wolkoed',
  ),
  'cutting-mat': sketchfab(
    'metric-cutting-mat-100pixels-per-cm-unit-cad3fdbcdae14e9386f65e1d5d551f74',
    'Metric_Cutting_Mat_100Pixels_Per_CM_Unit',
    'wattmaggle',
  ),
  servo: sketchfab(
    'emax-es08d-ii-micro-9g-rc-servo-3d-model-b458dc2d20134a609af1e06698abfe18',
    'EMAX ES08D II Micro 9g RC Servo 3D model',
    'NumaVIG',
  ),
  'tool-chest': polyHaven('metal_tool_chest', 'Metal Tool Chest', 'Yann Kervran, John Hutcheson'),
  shelves: polyHaven('steel_frame_shelves_01', 'Steel Frame Shelves 01', 'James Ray Cock'),
  'crate-milk': polyHaven('plastic_crate_01', 'Plastic Crate 01', 'PierreB3D'),
  'crate-stack': polyHaven('plastic_crate_03', 'Plastic Crate 03', 'Pacific Penguin'),
  'cardboard-box': polyHaven('cardboard_box_01', 'Cardboard Box 01', 'Rahul Chaudhary'),
  'flight-box': polyHaven('metal_toolbox', 'Metal Toolbox', 'Mateusz Sadek'),
  pliers: polyHaven('pliers', 'Pliers', 'PierreB3D'),
  screwdrivers: polyHaven('screwdrivers_02', 'Screwdrivers 02', 'BKS'),
  'adjustable-wrench': polyHaven('adjustable_wrench', 'Adjustable Wrench', 'Mateusz Sadek'),
  'combination-wrench': polyHaven('combination_wrench', 'Combination Wrench', 'BKS'),
  hammer: polyHaven('wooden_hammer_01', 'Wooden Hammer 01', 'James Ray Cock'),
  handsaw: polyHaven('handsaw_wood', 'Handsaw Wood', 'Konrad Szałankiewicz'),
  'tape-measure': polyHaven('measuring_tape_01', 'Measuring Tape 01', 'Kuutti Siitonen'),
  drill: polyHaven('Drill_01', 'Drill 01', 'Fernando Quinn'),
  multimeter: polyHaven('retro_multimeter', 'Retro Multimeter', 'elli moeller'),
  'desk-lamp': polyHaven('desk_lamp_arm_01', 'Desk Lamp Arm 01', 'Yann Kervran, Kuutti Siitonen'),
  stool: polyHaven('wooden_stool_01', 'Wooden Stool 01', 'Kuutti Siitonen'),
  extinguisher: polyHaven(
    'korean_fire_extinguisher_01',
    'Korean Fire Extinguisher 01',
    'UM JOORIN',
  ),
  'spray-paint': polyHaven('spray_paint_bottles', 'Spray Paint Bottles', 'James Ray Cock'),
  'lubricant-spray': polyHaven('lubricant_spray', 'Lubricant Spray', 'James Ray Cock'),
  'garden-hose': polyHaven(
    'garden_hose_wall_mounted_01',
    'Garden Hose Wall Mounted 01',
    'Kuutti Siitonen',
  ),
  spade: polyHaven('rusted_spade_01', 'Rusted Spade 01', 'Blemonade'),
  'watering-can': polyHaven('watering_can_metal_01', 'Watering Can Metal 01', 'Charles Nderitu'),
  barrel: polyHaven('Barrel_02', 'Barrel 02', 'Jorge Camacho'),
  ladder: polyHaven('ladder_sectioned_01', 'Ladder Sectioned 01', 'MP'),
  'tire-pump': polyHaven('tire_pump', 'Tire Pump', 'Garrison Gager'),
  'planter-box': polyHaven('planter_box_01', 'Planter Box 01', 'James Ray Cock'),
  'ceiling-light': polyHaven(
    'mounted_fluorescent_lights',
    'Mounted Fluorescent Lights',
    'Ulan Cabanilla',
  ),
} satisfies Record<string, HangarCredit>

export type PropId = keyof typeof PROPS

/** Scanned surface textures: each ships as `<id>_diff`, `_nor` and `_arm` WebP files. */
export const SURFACES = {
  floor: polyHaven('garage_floor', 'Garage Floor', 'Jenelle van Heerden'),
  plaster: polyHaven('painted_plaster_wall', 'Painted Plaster Wall', 'Amal Kumar'),
  brick: polyHaven('painted_brick', 'Painted Brick', 'Amal Kumar'),
  shutter: polyHaven(
    'painted_metal_shutter',
    'Painted Metal Shutter',
    'Dario Barresi, Rico Cilliers, Charlotte Baglioni',
  ),
  driveway: polyHaven('concrete_floor_01', 'Concrete Floor 01', 'Rob Tuytel'),
  lawn: polyHaven('leafy_grass', 'Leafy Grass', 'Charlotte Baglioni'),
} satisfies Record<string, HangarCredit>

export type SurfaceId = keyof typeof SURFACES

export const propUrl = (id: PropId) => `assets/hangar/${id}.glb`
export const surfaceUrl = (id: SurfaceId, map: 'diff' | 'nor' | 'arm') =>
  `assets/hangar/textures/${id}_${map}.webp`

/**
 * The garden outside the door: the field's ez-tree trees and hedge, grown,
 * thinned and baked by `scripts/hangar-garden.ts`.
 */
export const GARDEN_URL = 'assets/hangar/garden.glb'
