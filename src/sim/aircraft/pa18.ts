import type { AircraftSpec } from './types'

const FMS_MANUAL =
  'FMS 1700mm PA-18 manual FMM110PF (towerhobbies.com/.../Manuals/FMM110PF-Manual-MULTI.pdf)'
const JSBSIM_J3 =
  'JSBSim J3Cub.xml (github.com/JSBSim-Team/jsbsim/blob/master/aircraft/J3Cub/J3Cub.xml)'

/**
 * FMS 1700mm PA-18 Super Cub, electric. Wing root leading edge is the datum.
 * See `provenance` for where every number comes from; estimated values are
 * tuned against the flight-envelope tests in simulation.test.ts.
 */
export const pa18: AircraftSpec = {
  id: 'pa18',
  name: 'PA-18 Super Cub (1.7 m)',
  mass: 2.1,
  centerOfGravity: [0, -0.07, 0.082],
  inertia: [0.1, 0.18, 0.09],

  surfaces: [
    {
      name: 'wing',
      airfoil: 'usa35b',
      root: [0, 0, 0],
      semiSpan: 0.85,
      rootChord: 0.255,
      tipChord: 0.235,
      sweepDeg: 0,
      dihedralDeg: 1.5,
      incidenceDeg: 1.5,
      twistDeg: 0,
      mirrored: true,
      vertical: false,
      strips: 10,
      oswald: 0.85,
      slipstreamExposure: 0.35,
      controls: [
        {
          name: 'aileron',
          channel: 'aileron',
          chordFraction: 0.25,
          spanStart: 0.5,
          spanEnd: 0.95,
          throwMm: 16,
          gain: -1,
          mirrorGain: 1,
        },
        {
          name: 'flap',
          channel: 'flap',
          chordFraction: 0.25,
          spanStart: 0.08,
          spanEnd: 0.48,
          throwDeg: 40,
          gain: 1,
          mirrorGain: 1,
        },
      ],
    },
    {
      name: 'stabiliser',
      airfoil: 'naca0009',
      root: [0, -0.1, 0.67],
      semiSpan: 0.23,
      rootChord: 0.14,
      tipChord: 0.12,
      sweepDeg: 0,
      dihedralDeg: 0,
      incidenceDeg: 1.5,
      twistDeg: 0,
      mirrored: true,
      vertical: false,
      strips: 5,
      oswald: 0.8,
      downwashFrom: 'wing',
      controls: [
        {
          name: 'elevator',
          channel: 'elevator',
          chordFraction: 0.4,
          spanStart: 0.05,
          spanEnd: 1,
          throwMm: 18,
          gain: -1,
          mirrorGain: -1,
        },
      ],
    },
    {
      name: 'fin',
      airfoil: 'naca0009',
      root: [0, -0.08, 0.72],
      semiSpan: 0.2,
      rootChord: 0.16,
      tipChord: 0.08,
      sweepDeg: 25,
      dihedralDeg: 0,
      incidenceDeg: 0,
      twistDeg: 0,
      mirrored: false,
      vertical: true,
      strips: 5,
      oswald: 0.8,
      effectiveAspectRatio: 3.3,
      controls: [
        {
          name: 'rudder',
          channel: 'rudder',
          chordFraction: 0.45,
          spanStart: 0,
          spanEnd: 1,
          throwMm: 28,
          gain: 1,
        },
      ],
    },
  ],

  bodies: [
    {
      name: 'fuselage',
      position: [0, -0.06, 0.25],
      axialCdA: 0.014,
      sideArea: 0.14,
      topArea: 0.1,
      crossflowCd: 1.0,
    },
    {
      name: 'gearAndStruts',
      position: [0, -0.22, 0.02],
      axialCdA: 0.008,
      sideArea: 0.012,
      topArea: 0.004,
      crossflowCd: 1.0,
    },
  ],

  wheels: [
    {
      name: 'mainRight',
      attach: [0.18, -0.29, 0],
      travel: 0.04,
      radius: 0.045,
      springRate: 1800,
      damping: 40,
      rollingResistance: 0.04,
      lateralFriction: 0.8,
    },
    {
      name: 'mainLeft',
      attach: [-0.18, -0.29, 0],
      travel: 0.04,
      radius: 0.045,
      springRate: 1800,
      damping: 40,
      rollingResistance: 0.04,
      lateralFriction: 0.8,
    },
    {
      name: 'tail',
      attach: [0, -0.17, 0.95],
      travel: 0.02,
      radius: 0.02,
      springRate: 600,
      damping: 8,
      rollingResistance: 0.05,
      lateralFriction: 0.6,
      steering: { channel: 'rudder', maxDeg: 25 },
    },
  ],

  propeller: {
    diameter: 0.3048,
    pitch: 0.1905,
    blades: 2,
    airfoil: 'clarky',
    position: [0, -0.09, -0.33],
    rightThrustDeg: 2,
    downThrustDeg: 1.5,
    clockwiseFromBehind: true,
    inertia: 1.6e-4,
    chordDistribution: [
      [0.15, 0.115],
      [0.3, 0.175],
      [0.5, 0.19],
      [0.7, 0.165],
      [0.85, 0.13],
      [1.0, 0.07],
    ],
  },

  motor: { kv: 750, resistance: 0.045, noLoadCurrent: 1.5 },
  esc: { currentLimit: 55, lowVoltageCutoff: 3.3 },
  battery: {
    cells: 4,
    capacityMah: 2600,
    cellResistance: 0.006,
    ocvCurve: [
      [0, 3.3],
      [0.05, 3.5],
      [0.1, 3.6],
      [0.2, 3.7],
      [0.4, 3.77],
      [0.6, 3.87],
      [0.8, 4.0],
      [1, 4.2],
    ],
  },
  servo: { secondsPer60Deg: 0.12, slopDeg: 0.4 },

  collision: [
    { name: 'fuselage', halfExtents: [0.06, 0.08, 0.55], position: [0, -0.1, 0.25] },
    { name: 'wing', halfExtents: [0.85, 0.02, 0.125], position: [0, 0, 0.125] },
    { name: 'stabiliser', halfExtents: [0.23, 0.01, 0.065], position: [0, -0.1, 0.73] },
    { name: 'fin', halfExtents: [0.01, 0.1, 0.08], position: [0, 0.02, 0.78] },
  ],
  crashForce: 150,

  lowRates: { aileron: 0.75, elevator: 0.78, rudder: 0.71 },

  model: {
    url: 'models/pa18/pa18.glb',
    scale: 1,
    rotationDeg: [0, 0, 0],
    offset: [0, 0, 0],
    nodes: {},
    credit: {
      title: 'Piper PA-18',
      author: 'helijah',
      url: 'https://sketchfab.com/3d-models/piper-pa-18-413e3f81b0db4e0ebba0f27490732770',
      license: 'CC-BY-4.0',
    },
  },

  provenance: {
    mass: { basis: 'sourced', source: FMS_MANUAL, note: '~2100 g flying weight' },
    'centerOfGravity.2': { basis: 'sourced', source: FMS_MANUAL, note: 'CG 80-85 mm from LE' },
    'centerOfGravity.0': { basis: 'derived', note: 'symmetric' },
    'centerOfGravity.1': { basis: 'estimated', note: 'high wing; CG ~70 mm below wing LE' },
    inertia: {
      basis: 'estimated',
      note:
        'Component build-up: wing ~0.45 kg over 1.7 m (roll ~0.09), motor/battery forward and tail ' +
        'aft (pitch ~0.10), yaw ~ roll + pitch. No published measurements for a foam Cub.',
    },
    'surfaces.wing.semiSpan': { basis: 'sourced', source: FMS_MANUAL, note: '1700 mm span' },
    'surfaces.wing.rootChord': {
      basis: 'derived',
      source: FMS_MANUAL,
      note: 'Area 42 dm^2 over 1.7 m -> mean chord 0.247 m; slight tip rounding',
    },
    'surfaces.wing.tipChord': { basis: 'derived', note: 'see rootChord' },
    'surfaces.wing.root': { basis: 'derived', note: 'datum' },
    'surfaces.wing.sweepDeg': { basis: 'sourced', source: JSBSIM_J3, note: 'straight wing' },
    'surfaces.wing.dihedralDeg': { basis: 'estimated', note: 'full scale ~0.85 deg; foam RC 1-2' },
    'surfaces.wing.incidenceDeg': { basis: 'estimated', note: 'not published' },
    'surfaces.wing.twistDeg': { basis: 'estimated' },
    'surfaces.wing.strips': { basis: 'derived', note: 'resolution choice' },
    'surfaces.wing.oswald': { basis: 'estimated', note: 'rectangular wing' },
    'surfaces.wing.slipstreamExposure': {
      basis: 'estimated',
      note: 'Root sits on the cabin roof, which blanks the underside from the prop wash',
    },
    'surfaces.wing.controls.aileron': {
      basis: 'estimated',
      note: 'throw 16 mm high rate is SOURCED (FMS manual); chord fraction/span estimated',
    },
    'surfaces.wing.controls.flap': {
      basis: 'estimated',
      note: 'Flaps present per FMS manual; throws not published (20/40 deg estimated)',
    },
    'surfaces.stabiliser.incidenceDeg': {
      basis: 'tuned',
      note: 'Hands-off idle glide trims to ~12.5 m/s (simulation.test.ts)',
    },
    'surfaces.stabiliser': {
      basis: 'estimated',
      source: JSBSIM_J3,
      note:
        'Scaled from full-scale tail volume (Sh/S 0.137, Vh ~0.35) to ~5.8-6 dm^2 and 0.62 m arm. ' +
        'Elevator throw 18 mm is SOURCED (FMS manual).',
    },
    'surfaces.fin': {
      basis: 'estimated',
      source: JSBSIM_J3,
      note: 'Scaled from full-scale Vv ~0.022 to ~2.4 dm^2. Rudder throw 28 mm SOURCED (FMS manual).',
    },
    bodies: {
      basis: 'tuned',
      note: 'Boxy foam fuselage, windscreen, dummy engine; bush wheels, struts. Tuned for ~25 m/s top speed',
    },
    wheels: {
      basis: 'estimated',
      note:
        'Taildragger geometry for ~10 deg ground attitude; stiff wire gear ~5 mm static sag; tailwheel ' +
        'steering linked to rudder (confirmed on the 1300mm FMS manual)',
    },
    'propeller.diameter': { basis: 'sourced', source: 'FMSPROP054 12x7.5 (retailer listings)' },
    'propeller.pitch': { basis: 'sourced', source: 'FMSPROP054 12x7.5 (retailer listings)' },
    'propeller.blades': { basis: 'sourced', source: 'FMSPROP054 12x7.5 (retailer listings)' },
    propeller: {
      basis: 'estimated',
      note: 'Position from 1136 mm fuselage; thrust angles, inertia and blade planform generic',
    },
    'motor.kv': { basis: 'sourced', source: FMS_MANUAL, note: '3541-750KV' },
    motor: { basis: 'estimated', note: 'Rm/Io typical for a 3541 outrunner' },
    'esc.currentLimit': { basis: 'estimated', note: '45 A ESC (sourced); burst limit estimated' },
    'esc.lowVoltageCutoff': { basis: 'estimated', note: 'common LiPo cutoff' },
    'battery.cells': { basis: 'sourced', source: FMS_MANUAL, note: '4S 2200-2600 mAh' },
    'battery.capacityMah': { basis: 'sourced', source: FMS_MANUAL },
    'battery.cellResistance': { basis: 'estimated', note: '35C pack' },
    'battery.ocvCurve': { basis: 'estimated', note: 'generic LiPo discharge curve' },
    servo: { basis: 'estimated', note: 'Six 17 g servos (sourced); speed/slop typical' },
    collision: { basis: 'derived', note: 'Boxes around the airframe for crash contacts' },
    crashForce: { basis: 'estimated' },
    lowRates: { basis: 'derived', source: FMS_MANUAL, note: 'low/high rate throw ratios' },
    model: { basis: 'derived', note: 'Visual binding; filled in after inspecting the GLB' },
  },
}
