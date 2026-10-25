import type { PropId } from './props'

type V3 = [number, number, number]

export interface Placement {
  prop: PropId
  /** Where the prop's bottom centre sits, m (room frame: +x right, +z to the door). */
  at: V3
  /** Turn about the vertical, degrees. */
  yawDeg?: number
  /** Tilt about x then z after the turn, degrees: for things leaning or lying down. */
  tiltDeg?: [number, number]
  /** Casts shadows even on phones. */
  big?: boolean
}

/** Where the chosen aircraft stands: in the sun patch, nose to the door. */
export const PLANE_SPOT = { at: [-0.9, 0, 1.0] as V3, yawDeg: 160 }

/** Height of the workbench top, m. */
const BENCH = 0.966
/** Front edge of the worktop and its back, against the pegboard, m. */
const FRONT = -2.6
const BACK = -3.12

export const LAYOUT: Placement[] = [
  // Back wall: the workbench with its pegboard and tube light (vice on the
  // right end, tool cabinet under the left), the shelving beside it.
  { prop: 'workbench', at: [-0.9, 0, -2.88], yawDeg: -90, big: true },
  { prop: 'shelves', at: [1.85, 0, -2.97], big: true },
  // On the bench, left to right.
  { prop: 'printer', at: [-1.86, BENCH, -2.9], yawDeg: 5 },
  { prop: 'ca-glue', at: [-1.5, BENCH, FRONT - 0.08] },
  { prop: 'ca-glue', at: [-1.44, BENCH, FRONT - 0.13], yawDeg: 40 },
  { prop: 'cutting-mat', at: [-1.18, BENCH, -2.86], yawDeg: 3 },
  { prop: 'hobby-knife', at: [-1.1, BENCH + 0.003, -2.8], yawDeg: 30 },
  { prop: 'servo', at: [-1.32, BENCH + 0.003, -2.95] },
  { prop: 'servo', at: [-1.27, BENCH + 0.003, -2.98], yawDeg: 60 },
  { prop: 'transmitter', at: [-0.68, BENCH, -2.84], yawDeg: 12 },
  { prop: 'soldering-iron', at: [-0.95, BENCH + 0.01, FRONT - 0.07], yawDeg: 80, tiltDeg: [90, 0] },
  { prop: 'lipo', at: [-0.36, BENCH, -2.95], yawDeg: 75 },
  { prop: 'lipo-bag', at: [-0.38, BENCH, FRONT - 0.1], yawDeg: 188 },
  { prop: 'multimeter', at: [-0.1, BENCH, BACK + 0.12], yawDeg: -15 },
  { prop: 'tape-measure', at: [-0.06, BENCH, FRONT - 0.08], yawDeg: 30 },
  // Shelves: crates, boxes and cans.
  { prop: 'crate-stack', at: [1.85, 0.03, -2.97] },
  { prop: 'cardboard-box', at: [1.62, 0.6, -2.97], yawDeg: 90 },
  { prop: 'spray-paint', at: [2.1, 1.12, -2.97] },
  { prop: 'lubricant-spray', at: [1.6, 1.12, -2.93] },
  { prop: 'drill', at: [1.9, 1.64, -2.97], yawDeg: 20 },
  { prop: 'hammer', at: [1.55, 1.64, -2.95], tiltDeg: [90, 0], yawDeg: 80 },
  { prop: 'screwdrivers', at: [1.85, 1.12, -2.9], yawDeg: 5 },
  // Left wall: bike on hooks, ladder, garden things by the door.
  { prop: 'bike', at: [-2.85, 0.75, -1.4], yawDeg: 90, big: true },
  { prop: 'ladder', at: [-2.88, 0, 0.5], yawDeg: 90, tiltDeg: [-6, 0], big: true },
  { prop: 'garden-hose', at: [-2.86, 1.1, 1.7], yawDeg: 90 },
  { prop: 'spade', at: [-2.85, 0, 2.4], yawDeg: 90, tiltDeg: [-10, 0] },
  { prop: 'watering-can', at: [-2.55, 0, 2.75], yawDeg: 30 },
  // Right wall: tool chest under the window, shop vac, extinguisher by the door.
  { prop: 'tool-chest', at: [2.68, 0, -1.0], yawDeg: -90, big: true },
  { prop: 'shop-vac', at: [2.5, 0, 0.6], yawDeg: -60, big: true },
  { prop: 'barrel', at: [2.55, 0, 1.6], big: true },
  { prop: 'tire-pump', at: [2.8, 0, 2.3], yawDeg: -90 },
  { prop: 'extinguisher', at: [2.75, 0, 2.85], yawDeg: -90 },
  // On the floor round the plane.
  { prop: 'flight-box', at: [0.95, 0, -0.7], yawDeg: 25 },
  { prop: 'stool', at: [-0.7, 0, -2.0], big: true },
  { prop: 'crate-milk', at: [1.15, 0, -2.2], yawDeg: 10 },
  { prop: 'handsaw', at: [1.0, 0.27, -2.2], tiltDeg: [0, 90], yawDeg: 10 },
  { prop: 'adjustable-wrench', at: [1.25, 0.27, -2.25], tiltDeg: [90, 0], yawDeg: -30 },
  { prop: 'combination-wrench', at: [0.6, 0, 2.3], yawDeg: 40 },
  { prop: 'pliers', at: [0.9, 0.305, -0.65], tiltDeg: [90, 0], yawDeg: 70 },
  { prop: 'desk-lamp', at: [0.1, BENCH, BACK + 0.05], yawDeg: 180 },
  // Overhead.
  { prop: 'ceiling-light', at: [0, 2.565, -0.9] },
  { prop: 'ceiling-light', at: [0, 2.565, 1.4] },
  // Outside the door.
  { prop: 'planter-box', at: [3.7, 0, 3.9], yawDeg: 90 },
]
