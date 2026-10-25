import type { AircraftSpec } from './types'

const MANUAL =
  'E-flite Extra 300 3D 1.3m manual EFL11550/EFL11575 (https://www.horizonhobby.com/on/demandware.static/-/Sites-horizon-master/default/dw59fbbadc/Manuals/EFL11550-75-Manual-EN.pdf)'
const PAGE =
  'E-flite Extra 300 3D 1.3m PNP product page, specs tab (https://www.horizonhobby.com/product/extra-300-3d-1.3m-pnp/EFL11575.html)'
const MODEL =
  'Upitis Extra 300 glTF (scripts/extra300/export.py), measured from vertices; scaled to the 1308 mm span and stretched x1.15 in length to the RC proportions'

/**
 * E-flite Extra 300 3D 1.3m, electric, flown without its AS3X/SAFE
 * stabiliser. Wing root leading edge is the datum. See `provenance` for
 * where every number comes from; estimated values are tuned against the
 * flight-envelope tests in extra300.envelope.test.ts.
 */
export const extra300: AircraftSpec = {
  id: 'extra300',
  name: 'Extra 300 (1.3 m)',
  role: 'aerobat',
  summary:
    'A neutral, powerful aerobat: it rolls axially, holds a knife edge and goes where it is pointed.',
  mass: 1.51,
  centerOfGravity: [0, -0.01, 0.095],
  cgRange: [0.09, 0.1],
  inertia: [0.11, 0.165, 0.055],

  surfaces: [
    {
      name: 'wing',
      airfoil: 'naca0012',
      root: [0, 0, 0],
      semiSpan: 0.654,
      rootChord: 0.3802,
      tipChord: 0.184,
      sweepDeg: 4.48,
      dihedralDeg: 0,
      incidenceDeg: 0,
      twistDeg: 0,
      mirrored: true,
      vertical: false,
      strips: 10,
      oswald: 0.85,
      slipstreamExposure: 0.6,
      controls: [
        {
          name: 'aileron',
          channel: 'aileron',
          chordFraction: 0.28,
          spanStart: 0.15,
          spanEnd: 0.99,
          throwMm: 50,
          gain: -1,
          mirrorGain: 1,
        },
      ],
    },
    {
      name: 'stabiliser',
      airfoil: 'naca0009',
      root: [0, 0.0847, 0.7483],
      semiSpan: 0.2815,
      rootChord: 0.1899,
      tipChord: 0.1179,
      sweepDeg: 10.76,
      dihedralDeg: 0,
      incidenceDeg: -1.5,
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
          chordFraction: 0.37,
          spanStart: 0.05,
          spanEnd: 1,
          throwMm: 60,
          gain: -1,
          mirrorGain: -1,
        },
      ],
    },
    {
      name: 'fin',
      airfoil: 'naca0009',
      root: [0, 0.0225, 0.805],
      semiSpan: 0.2423,
      rootChord: 0.1973,
      tipChord: 0.0962,
      sweepDeg: 8.68,
      dihedralDeg: 0,
      incidenceDeg: 0,
      twistDeg: 0,
      mirrored: false,
      vertical: true,
      strips: 8,
      oswald: 0.8,
      effectiveAspectRatio: 2.6,
      controls: [
        {
          name: 'rudder',
          channel: 'rudder',
          chordFraction: 0.6,
          spanStart: 0,
          spanEnd: 1,
          throwMm: 100,
          gain: 1,
        },
      ],
    },
  ],

  bodies: [
    {
      name: 'fuselage',
      position: [0, 0, 0.3],
      axialCdA: 0.007,
      sideArea: 0.148,
      topArea: 0.11,
      crossflowCd: 1.0,
    },
    {
      // The fuselage as a lifting body in sideslip, acting near its quarter
      // length; drag is counted on the fuselage above.
      name: 'fuselageSide',
      position: [0, 0, 0.03],
      axialCdA: 0,
      sideArea: 0.148,
      topArea: 0,
      crossflowCd: 0,
      sideForceSlope: 0.4,
    },
    {
      name: 'gear',
      position: [0, -0.13, 0],
      axialCdA: 0.003,
      sideArea: 0.006,
      topArea: 0.004,
      crossflowCd: 1.0,
    },
  ],

  wheels: [
    {
      name: 'mainRight',
      attach: [0.1502, -0.1458, -0.0014],
      travel: 0.02,
      radius: 0.0298,
      springRate: 1800,
      damping: 35,
      rollingResistance: 0.05,
      lateralFriction: 0.8,
    },
    {
      name: 'mainLeft',
      attach: [-0.1502, -0.1458, -0.0014],
      travel: 0.02,
      radius: 0.0298,
      springRate: 1800,
      damping: 35,
      rollingResistance: 0.05,
      lateralFriction: 0.8,
    },
    {
      name: 'tail',
      attach: [0, -0.0197, 0.9761],
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
    diameter: 0.3302,
    pitch: 0.1524,
    blades: 2,
    airfoil: 'clarky',
    position: [0, 0.0355, -0.2336],
    rightThrustDeg: 2,
    downThrustDeg: 0,
    clockwiseFromBehind: true,
    inertia: 3.5e-4,
    chordDistribution: [
      [0.15, 0.12],
      [0.3, 0.18],
      [0.5, 0.19],
      [0.7, 0.165],
      [0.85, 0.13],
      [1.0, 0.07],
    ],
  },

  motor: { kv: 910, resistance: 0.03, noLoadCurrent: 2 },
  esc: { currentLimit: 70, lowVoltageCutoff: 3.3 },
  battery: {
    cells: 4,
    capacityMah: 2200,
    cellResistance: 0.008,
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
  servo: { secondsPer60Deg: 0.1, slopDeg: 0.3 },
  buildTolerance: { aileronDeg: 0.5, elevatorDeg: 0.75, rudderDeg: 1 },

  collision: [
    { name: 'fuselage', halfExtents: [0.08, 0.09, 0.35], position: [0, 0, 0.05] },
    { name: 'tailBoom', halfExtents: [0.05, 0.04, 0.32], position: [0, 0.035, 0.68] },
    { name: 'wing', halfExtents: [0.654, 0.02, 0.19], position: [0, 0, 0.19] },
    { name: 'stabiliser', halfExtents: [0.2815, 0.008, 0.095], position: [0, 0.0847, 0.795] },
    { name: 'fin', halfExtents: [0.008, 0.127, 0.1], position: [0, 0.139, 0.905] },
  ],
  crashSpeed: 3,

  lowRates: { aileron: 0.6, elevator: 0.75, rudder: 0.7 },
  defaultExpo: { aileron: 0.3, elevator: 0.3, rudder: 0.3 },

  model: {
    // Martins Upitis's full-scale Extra 300 (6.1 m span), levelled and
    // exported nose -z by scripts/extra300/export.py, scaled to the 1308 mm
    // span and stretched in length to the RC model's proportions; offset puts
    // its wing root leading edge on the datum. scripts/split-model.ts makes
    // the moving parts nodes turning about their local +X (docs/adr/0010).
    url: 'models/extra300/scene.gltf',
    scale: [0.214426, 0.214426, 0.24659],
    rotationDeg: [0, 0, 0],
    offset: [0, -0.19191, -0.00136],
    nodes: {
      propeller: { node: 'propeller', axis: [1, 0, 0], blades: 'propeller_blades' },
      controls: {
        'aileron.left': { node: 'aileron_left', hingeAxis: [1, 0, 0] },
        'aileron.right': { node: 'aileron_right', hingeAxis: [1, 0, 0] },
        'elevator.left': { node: 'elevator_left', hingeAxis: [1, 0, 0] },
        'elevator.right': { node: 'elevator_right', hingeAxis: [1, 0, 0] },
        'rudder.center': { node: 'rudder', hingeAxis: [1, 0, 0] },
      },
    },
    credit: {
      title: 'Aerobatics aircraft (Extra 300)',
      author: 'Martins Upitis',
      url: 'https://opengameart.org/content/aerobatics-aircraft',
      license: 'CC-BY-SA-3.0',
    },
  },

  provenance: {
    mass: {
      basis: 'sourced',
      source: MANUAL,
      note: 'Flying weight 1510-1696 g; 1510 g is with the 4S 2200 pack the manual sets the CG with',
    },
    'centerOfGravity.2': {
      basis: 'sourced',
      source: MANUAL,
      note: 'CG 90-100 mm from LE at the fuselage',
    },
    cgRange: { basis: 'sourced', source: MANUAL, note: 'CG 90-100 mm from LE at the fuselage' },
    'centerOfGravity.0': { basis: 'derived', note: 'symmetric' },
    'centerOfGravity.1': {
      basis: 'estimated',
      note: 'Mid wing; battery and motor sit near the wing plane, the battery a little below it',
    },
    inertia: {
      basis: 'estimated',
      note:
        'Component build-up: wing ~0.4 kg over 1.3 m (roll ~0.055); motor and prop 0.33 m ahead of ' +
        'the CG, foam tail 0.75 m behind (pitch ~0.11); yaw ~ roll + pitch',
    },
    'surfaces.wing.semiSpan': { basis: 'sourced', source: MANUAL, note: '1308 mm span' },
    'surfaces.wing.rootChord': {
      basis: 'derived',
      source: MANUAL,
      note: 'Area 36.9 dm^2 over 1.308 m -> mean chord 0.282 m, with the model wing taper ratio 0.484',
    },
    'surfaces.wing.tipChord': { basis: 'derived', note: 'see rootChord' },
    'surfaces.wing.root': { basis: 'derived', note: 'datum' },
    'surfaces.wing.sweepDeg': { basis: 'derived', source: MODEL, note: 'leading-edge sweep' },
    'surfaces.wing.dihedralDeg': {
      basis: 'estimated',
      note: 'Model leading edge rises ~0.5 deg; foam aerobats are built flat',
    },
    'surfaces.wing.incidenceDeg': {
      basis: 'estimated',
      note: 'Not published; 0 deg to the thrust line, the usual 0-0-0 aerobat rigging',
    },
    'surfaces.wing.twistDeg': {
      basis: 'estimated',
      note: 'no washout on a symmetric aerobat wing',
    },
    'surfaces.wing.strips': { basis: 'derived', note: 'resolution choice' },
    'surfaces.wing.oswald': { basis: 'estimated', note: 'tapered wing, taper ratio ~0.5' },
    'surfaces.wing.slipstreamExposure': {
      basis: 'estimated',
      note: 'Mid wing: the fuselage covers the inner third of the slipstream over the root',
    },
    'surfaces.wing.controls.aileron': {
      basis: 'tuned',
      source: MODEL,
      note:
        'Chord fraction (24% inboard to 34% at the tip) from the full-scale model. Span tuned ' +
        "from the model's 26% of the semi-span in to 15%, for the RC model's oversized ailerons " +
        "(Horizon: 'oversized control surfaces'): it then rolls ~745 deg/s level at full power, " +
        'as measured from flight video (705-830 deg/s). Throw 50 mm high rate is SOURCED (manual)',
    },
    'surfaces.stabiliser': {
      basis: 'derived',
      source: MODEL,
      note:
        'Span, chords, sweep, position from the model (8.7 dm^2, Sh/S 0.235). Elevator chord ' +
        'fraction 35-42% from the model. Elevator throw 60 mm high rate SOURCED (manual)',
    },
    'surfaces.stabiliser.incidenceDeg': {
      basis: 'tuned',
      note:
        'Decalage that trims the hands-off idle glide to ~13.6 m/s, 1.7x the stall speed: the ' +
        'same trim margin as the PA-18, as a pilot trims it to fly with the stick centred',
    },
    'surfaces.fin': {
      basis: 'derived',
      source: MODEL,
      note:
        'Fin and rudder from the model as one trapezoid of equal area (3.6 dm^2), rudder 60-70% ' +
        'of its chord. Effective AR includes end-plating by fuselage and stabiliser (estimated). ' +
        'Rudder throw 100 mm high rate SOURCED (manual)',
    },
    bodies: {
      basis: 'estimated',
      note:
        'Side and top areas measured from the model (fuselage side ~15 dm^2). Drag areas from ' +
        'frontal areas: round cowl ~0.019 m^2 at Cd ~0.3 plus canopy; wire gear with spats',
    },
    'bodies.fuselageSide': {
      basis: 'derived',
      note:
        'Slender-wing lift slope pi*AR/2 with the fuselage side AR = depth^2 / side area = ' +
        '0.18^2 / 0.148 ~ 0.22 -> ~0.35-0.4 per rad, at the quarter length of its side profile',
    },
    wheels: {
      basis: 'derived',
      source: MODEL,
      note:
        'Contact points and wheel sizes from the model (8.4 deg ground attitude), set so the ' +
        'wheels touch at the static sag. ' +
        'Rolling resistance 0.05 for the mown grass runway (short grass: Torenbeek 0.045, Stinton 0.05; dry concrete 0.02). ' +
        'Springs and side friction estimated. Tailwheel steering ' +
        'linked to the rudder (sourced: manual, tail wheel steering)',
    },
    'propeller.diameter': { basis: 'sourced', source: PAGE, note: '13x6E wooden' },
    'propeller.pitch': { basis: 'sourced', source: PAGE, note: '13x6E wooden' },
    'propeller.blades': { basis: 'sourced', source: PAGE, note: '13x6E wooden' },
    'propeller.position': { basis: 'derived', source: MODEL, note: 'centre of the blade disc' },
    propeller: {
      basis: 'estimated',
      note: 'Thrust angles, inertia (wooden prop ~45 g) and blade planform generic',
    },
    'motor.kv': { basis: 'sourced', source: MANUAL, note: '4250-910Kv (EFL11596)' },
    motor: { basis: 'estimated', note: 'Rm/Io typical for a 4250 outrunner' },
    'esc.currentLimit': {
      basis: 'estimated',
      note: '60 A ESC (sourced: manual); burst limit estimated',
    },
    'esc.lowVoltageCutoff': { basis: 'estimated', note: 'common LiPo cutoff' },
    'battery.cells': { basis: 'sourced', source: MANUAL, note: '4S 2200-3200 mAh 30-40C' },
    'battery.capacityMah': { basis: 'sourced', source: MANUAL, note: 'SPMX22004S30, the CG pack' },
    'battery.cellResistance': { basis: 'estimated', note: '30C pack' },
    'battery.ocvCurve': { basis: 'estimated', note: 'generic LiPo discharge curve' },
    servo: {
      basis: 'estimated',
      note: 'Four 23 g digital metal-gear servos (sourced: manual); speed/slop typical',
    },
    buildTolerance: {
      basis: 'estimated',
      note:
        'Linkages set by eye on a foam ARF: a maiden flight typically needs a few trim clicks ' +
        'per axis. The band keeps the worst case within the radio trim range',
    },
    collision: { basis: 'derived', source: MODEL, note: 'Boxes around the model airframe' },
    crashSpeed: { basis: 'estimated', note: 'Foam airframe / prop survive bumps below ~3 m/s' },
    lowRates: { basis: 'derived', source: MANUAL, note: 'low/high rate throw ratios' },
    defaultExpo: {
      basis: 'sourced',
      source: MANUAL,
      note: 'high-rate expo 30% (15% on low rates)',
    },
    model: { basis: 'derived', source: MODEL, note: 'Visual binding' },
  },
}
