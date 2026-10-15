import type { AircraftSpec } from './types'

const FMS_MANUAL =
  'FMS 1700mm PA-18 manual FMM110PF (towerhobbies.com/.../Manuals/FMM110PF-Manual-MULTI.pdf)'
const MODEL = 'helijah PA-18 glTF, measured from vertices and scaled x0.1586 (1.7 m span)'
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
  centerOfGravity: [0, -0.09, 0.082],
  cgRange: [0.08, 0.085],
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
      incidenceDeg: 0,
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
      root: [0, -0.046, 0.66],
      semiSpan: 0.229,
      rootChord: 0.178,
      tipChord: 0.12,
      sweepDeg: 0,
      dihedralDeg: 0,
      incidenceDeg: 0,
      twistDeg: 0,
      mirrored: true,
      vertical: false,
      strips: 8,
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
      root: [0, -0.044, 0.66],
      semiSpan: 0.166,
      rootChord: 0.194,
      tipChord: 0.09,
      sweepDeg: 30,
      dihedralDeg: 0,
      incidenceDeg: 0,
      twistDeg: 0,
      mirrored: false,
      vertical: true,
      strips: 8,
      oswald: 0.8,
      effectiveAspectRatio: 2.3,
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
      position: [0, -0.08, 0.25],
      axialCdA: 0.014,
      sideArea: 0.14,
      topArea: 0.1,
      crossflowCd: 1.0,
    },
    {
      name: 'gearAndStruts',
      position: [0, -0.2, 0.01],
      axialCdA: 0.008,
      sideArea: 0.012,
      topArea: 0.004,
      crossflowCd: 1.0,
    },
  ],

  wheels: [
    {
      name: 'mainRight',
      attach: [0.141, -0.25, 0.0105],
      travel: 0.02,
      radius: 0.036,
      springRate: 1800,
      damping: 40,
      rollingResistance: 0.04,
      lateralFriction: 0.8,
    },
    {
      name: 'mainLeft',
      attach: [-0.141, -0.25, 0.0105],
      travel: 0.02,
      radius: 0.036,
      springRate: 1800,
      damping: 40,
      rollingResistance: 0.04,
      lateralFriction: 0.8,
    },
    {
      name: 'tail',
      attach: [0, -0.1035, 0.819],
      travel: 0.015,
      radius: 0.015,
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
    position: [0, -0.103, -0.23],
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
  buildTolerance: { aileronDeg: 0.5, elevatorDeg: 0.75, rudderDeg: 1 },

  collision: [
    { name: 'cabin', halfExtents: [0.06, 0.11, 0.3], position: [0, -0.09, 0.05] },
    { name: 'tailBoom', halfExtents: [0.04, 0.05, 0.235], position: [0, -0.05, 0.585] },
    { name: 'wing', halfExtents: [0.85, 0.02, 0.128], position: [0, 0.02, 0.128] },
    { name: 'stabiliser', halfExtents: [0.229, 0.008, 0.089], position: [0, -0.046, 0.749] },
    { name: 'fin', halfExtents: [0.008, 0.083, 0.097], position: [0, 0.04, 0.757] },
  ],
  crashSpeed: 3,

  lowRates: { aileron: 0.75, elevator: 0.78, rudder: 0.71 },

  model: {
    // helijah's full-scale PA-18 (10.72 m span, Z-up, nose -X) scaled to 1.7 m
    // and turned nose-forward; offset puts its wing root leading edge on the
    // datum. The export is merged per material, so no control surface or
    // propeller node can be animated until it is split (see docs/adr/0010).
    url: 'models/pa18/scene.gltf',
    scale: 0.1586,
    rotationDeg: [0, -90, 0],
    offset: [0, -0.0917, 0.3107],
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
    cgRange: { basis: 'sourced', source: FMS_MANUAL, note: 'CG 80-85 mm from LE' },
    'centerOfGravity.0': { basis: 'derived', note: 'symmetric' },
    'centerOfGravity.1': {
      basis: 'estimated',
      note: 'High wing, battery low in the cabin: CG ~90 mm below the wing, on the thrust line',
    },
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
    'surfaces.wing.incidenceDeg': {
      basis: 'estimated',
      note: 'Not published; 0 deg to the thrust-line datum (only decalage matters for trim)',
    },
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
      note:
        'Zero decalage trims the hands-off idle glide to ~12.5 m/s; zero to the thrust line keeps ' +
        'the prop wash from lifting the tail at full power on the ground',
    },
    'surfaces.stabiliser': {
      basis: 'derived',
      source: MODEL,
      note:
        'Span, chord, position from the model (~6.8 dm^2; full-scale Sh/S 0.137 cross-checked ' +
        'against JSBSim J3Cub). Elevator throw 18 mm SOURCED (FMS manual); chord fraction estimated.',
    },
    'surfaces.fin': {
      basis: 'derived',
      source: MODEL,
      note:
        'Height, chords, sweep from the model (~2.4 dm^2). Effective AR includes end-plating by ' +
        'fuselage and stabiliser (estimated). Rudder throw 28 mm SOURCED (FMS manual).',
    },
    bodies: {
      basis: 'tuned',
      note: 'Boxy foam fuselage, windscreen, dummy engine; bush wheels, struts. Tuned for ~25 m/s top speed',
    },
    wheels: {
      basis: 'derived',
      source: MODEL,
      note:
        'Contact points and wheel sizes from the model (12 deg ground attitude). Springs/friction ' +
        'estimated: stiff wire gear ~5 mm static sag. Tailwheel steering linked to rudder ' +
        '(confirmed on the 1300mm FMS manual).',
    },
    'propeller.diameter': { basis: 'sourced', source: 'FMSPROP054 12x7.5 (retailer listings)' },
    'propeller.pitch': { basis: 'sourced', source: 'FMSPROP054 12x7.5 (retailer listings)' },
    'propeller.blades': { basis: 'sourced', source: 'FMSPROP054 12x7.5 (retailer listings)' },
    'propeller.position': { basis: 'derived', source: MODEL, note: 'spinner centre' },
    propeller: {
      basis: 'estimated',
      note: 'Thrust angles, inertia and blade planform generic',
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
    buildTolerance: {
      basis: 'estimated',
      note:
        'Linkages set by eye on a foam ARF: a maiden flight typically needs a few trim clicks ' +
        'per axis. The band keeps the worst case within the radio trim range',
    },
    collision: { basis: 'derived', source: MODEL, note: 'Boxes around the model airframe' },
    crashSpeed: { basis: 'estimated', note: 'Foam airframe / prop survive bumps below ~3 m/s' },
    lowRates: { basis: 'derived', source: FMS_MANUAL, note: 'low/high rate throw ratios' },
    model: { basis: 'derived', source: MODEL, note: 'Visual binding' },
  },
}
