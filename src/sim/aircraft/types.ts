/**
 * Aircraft definition. Everything a plane is lives in one of these: geometry,
 * mass properties, aerodynamic surfaces, gear, powertrain, servos and the
 * mapping onto the visual glTF model.
 *
 * Body frame (same as three.js / glTF cameras): +x right wing, +y up,
 * +z backwards (nose points along -z). Origin is the "datum": the wing root
 * leading edge on the fuselage centreline. Lengths in metres, masses in kg,
 * angles in degrees, unless a field name says otherwise.
 */

export type Vec3Tuple = readonly [number, number, number]

/** Normalised receiver channels the airframe responds to. */
export type Channel = 'aileron' | 'elevator' | 'rudder' | 'throttle' | 'flap'

export type AirfoilId = 'usa35b' | 'clarky' | 'naca0009' | 'naca0012'

export interface ControlSurfaceSpec {
  name: string
  channel: Channel
  /** Fraction of local chord that is hinged. */
  chordFraction: number
  /** Spanwise extent as a fraction of the surface's semi-span (0 = root). */
  spanStart: number
  spanEnd: number
  /**
   * Maximum mechanical throw, measured at the trailing edge of the control
   * surface's inboard end, as in RC manuals. Low rates are a transmitter
   * concern (dual rate), not an airframe property.
   */
  throwMm?: number
  /** Alternative to throwMm for surfaces whose manual gives degrees. */
  throwDeg?: number
  /**
   * Sign applied to the channel on this half. Positive deflection moves the
   * trailing edge towards -normal (down on a wing), increasing lift.
   */
  gain: number
  /** Gain on the mirrored (left) half, for mirrored surfaces. */
  mirrorGain?: number
}

export interface LiftingSurfaceSpec {
  name: string
  airfoil: AirfoilId
  /** Leading edge at the root, body frame. */
  root: Vec3Tuple
  semiSpan: number
  rootChord: number
  tipChord: number
  sweepDeg: number
  dihedralDeg: number
  incidenceDeg: number
  /** Tip incidence relative to root (negative = washout). */
  twistDeg: number
  /** Adds a mirrored left half (wings, stabiliser). */
  mirrored: boolean
  /** Fin: span axis is +y and the normal points left (-x). */
  vertical: boolean
  /** Spanwise strips per half. */
  strips: number
  /** Span efficiency for the induced-angle estimate. */
  oswald: number
  /** Effective aspect ratio override (e.g. fin end-plated by fuselage/stab). */
  effectiveAspectRatio?: number
  /** This surface sits in the downwash of another surface. */
  downwashFrom?: string
  /**
   * Fraction of the prop slipstream velocity this surface feels (default 1).
   * Lower it where the fuselage blanks the flow, e.g. a high wing's root
   * sitting on the cabin roof.
   */
  slipstreamExposure?: number
  controls: ControlSurfaceSpec[]
}

/** Fuselage, gear legs, struts: bluff-body drag with crossflow. */
export interface BodySpec {
  name: string
  /** Centre of pressure, body frame. */
  position: Vec3Tuple
  /** Drag area (Cd * A) for flow along the body z axis, m^2. */
  axialCdA: number
  /** Projected side (yz-plane) and top (xz-plane) areas, m^2. */
  sideArea: number
  topArea: number
  crossflowCd: number
  /**
   * Side force per radian of sideslip on `sideArea`: a deep, flat-sided
   * fuselage is a lifting body of very low aspect ratio, so its side force
   * grows linearly with sideslip before crossflow drag takes over. It is what
   * holds a knife edge. Absent: crossflow drag only.
   */
  sideForceSlope?: number
}

export interface WheelSpec {
  name: string
  /** Top of the suspension travel, body frame. */
  attach: Vec3Tuple
  /** Suspension travel along body -y, m. */
  travel: number
  radius: number
  springRate: number
  damping: number
  rollingResistance: number
  /** Peak lateral friction coefficient. */
  lateralFriction: number
  steering?: { channel: Channel; maxDeg: number }
}

export interface PropellerSpec {
  diameter: number
  pitch: number
  blades: number
  airfoil: AirfoilId
  /** Hub position, body frame. */
  position: Vec3Tuple
  /** Positive = thrust line angled right/down (degrees). */
  rightThrustDeg: number
  downThrustDeg: number
  /** Clockwise when viewed from behind (the common "tractor" rotation). */
  clockwiseFromBehind: boolean
  /** Rotating inertia of prop + motor bell, kg m^2. */
  inertia: number
  /** Blade chord as a fraction of radius, at the given radius fractions. */
  chordDistribution: readonly (readonly [number, number])[]
}

export interface MotorSpec {
  kv: number
  resistance: number
  noLoadCurrent: number
}

export interface EscSpec {
  currentLimit: number
  /** Per-cell voltage below which power is progressively cut. */
  lowVoltageCutoff: number
}

export interface BatterySpec {
  cells: number
  capacityMah: number
  /** Per-cell internal resistance, ohm. */
  cellResistance: number
  /** Open-circuit voltage per cell vs state of charge [soc, volts]. */
  ocvCurve: readonly (readonly [number, number])[]
}

export interface ServoSpec {
  /** Seconds per 60 degrees of output. */
  secondsPer60Deg: number
  /** Total backlash at the surface, degrees. */
  slopDeg: number
}

/**
 * The largest neutral offset a typical build leaves at each control
 * surface, degrees: linkages set by eye, a warped aileron, a fin glued a
 * touch off. A flight with build tolerances draws its offsets from this band.
 */
export interface BuildToleranceSpec {
  aileronDeg: number
  elevatorDeg: number
  rudderDeg: number
}

export interface CollisionShapeSpec {
  name: string
  /** Box half extents. */
  halfExtents: Vec3Tuple
  position: Vec3Tuple
}

export interface ModelBinding {
  /** glTF file, relative to /public. */
  url: string
  /**
   * Transform applied to the glTF scene to land it in the body frame. Scale
   * is per body axis, so a full-scale model can take an RC model's
   * proportions.
   */
  scale: Vec3Tuple
  rotationDeg: Vec3Tuple
  offset: Vec3Tuple
  /**
   * glTF nodes that animate. Axes are in each node's local frame. Control
   * keys match telemetry deflections ("aileron.left", "rudder.center").
   * Positive deflection is trailing edge towards -normal (down on wings,
   * right on the fin), i.e. a right-handed rotation about +hingeAxis. The
   * propeller turns right-handed about +axis as propAngle grows; `blades` is
   * a child of it, shown only at low rpm.
   */
  nodes: {
    propeller?: { node: string; axis: Vec3Tuple; blades?: string }
    controls?: Record<string, { node: string; hingeAxis: Vec3Tuple }>
  }
  credit: { title: string; author: string; url: string; license: string }
}

/** How a number in the spec was obtained (decision Q33). */
export type Basis = 'sourced' | 'derived' | 'estimated' | 'tuned'

export interface Provenance {
  basis: Basis
  source?: string
  note?: string
}

export interface AircraftSpec {
  id: string
  name: string
  /** What it is for, as the hangar tags it. */
  role: 'trainer' | 'aerobat'
  /** One line on how it flies, for the hangar. */
  summary: string
  mass: number
  centerOfGravity: Vec3Tuple
  /** The manual's recommended CG range, m behind the datum (front, back). */
  cgRange: readonly [number, number]
  /** Principal moments of inertia about body x (pitch), y (yaw), z (roll). */
  inertia: Vec3Tuple
  surfaces: LiftingSurfaceSpec[]
  bodies: BodySpec[]
  wheels: WheelSpec[]
  propeller: PropellerSpec
  motor: MotorSpec
  esc: EscSpec
  battery: BatterySpec
  servo: ServoSpec
  buildTolerance: BuildToleranceSpec
  collision: CollisionShapeSpec[]
  /**
   * Airframe impact speed (m/s) that counts as a crash: contact impulse on
   * anything but the wheels exceeding mass x crashSpeed within 0.1 s.
   */
  crashSpeed: number
  /** Default dual-rate percentages for low rates, from the manual. */
  lowRates: Partial<Record<Channel, number>>
  /** Default expo (0..1) the manual recommends, where it gives one. */
  defaultExpo?: Partial<Record<Channel, number>>
  model: ModelBinding
  /**
   * Where each number came from, keyed by dotted path into this object.
   * A key covers everything beneath it ("propeller" covers propeller.pitch).
   */
  provenance: Record<string, Provenance>
}
