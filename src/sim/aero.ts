import { Vector3 } from 'three'
import type { AircraftSpec, ControlSurfaceSpec, LiftingSurfaceSpec } from './aircraft/types'
import { airfoil, type Airfoil, type Coefficients } from './airfoil'
import type { BuildTolerances } from './build'
import { DYNAMIC_VISCOSITY } from './atmosphere'
import type { Propulsion } from './propulsion'
import type { SurfaceChannel } from './servos'

const DEG = Math.PI / 180

/** One spanwise element of a lifting surface. Vectors are body frame. */
export interface Strip {
  readonly surface: SurfaceState
  /** Quarter-chord point. */
  readonly position: Vector3
  readonly chord: number
  readonly width: number
  /** Chord line towards the leading edge. */
  readonly forward: Vector3
  /** Lift reference normal (up for wings, left for the fin). */
  readonly normal: Vector3
  /** Span axis; forward x normal. */
  readonly span: Vector3
  readonly control?: StripControl
  // Per-step outputs, for telemetry and the debug overlay.
  readonly force: Vector3
  alpha: number
  cl: number
  stalled: boolean
  inSlipstream: boolean
}

interface StripControl {
  name: string
  channel: SurfaceChannel
  gain: number
  /** Full-command deflection, rad. */
  throw: number
  /** Thin-airfoil flap effectiveness d(alpha)/d(delta). */
  tau: number
  /** d(cm)/d(delta) per rad. */
  cmPerRad: number
  chordFraction: number
  /** Linkage backlash half-width, rad. */
  slop: number
  /** Current deflection, rad (positive = trailing edge towards -normal). */
  deflection: number
}

export interface SurfaceState {
  readonly spec: LiftingSurfaceSpec
  readonly area: number
  readonly aspectRatio: number
  /** Lagged surface lift coefficient (drives the induced angle). */
  cl: number
  inducedAngle: number
  /** Lagged downwash this surface sheds, rad. */
  downwash: number
  readonly downwashSource?: SurfaceState
  /** Distance from the source's quarter chord, for the downwash lag. */
  readonly downwashLag: number
  /** Accumulates sum(cl * c * ds) during a step. */
  liftSum: number
}

export interface AeroInput {
  dt: number
  density: number
  /** CoM velocity through the air, body frame. */
  airVelocity: Vector3
  bodyRate: Vector3
  centerOfGravity: Vector3
  propulsion: Propulsion
  /** Wing height above ground, m (ground effect). */
  heightAboveGround: number
  /** Servo outputs. */
  servos: Record<SurfaceChannel, number>
}

/**
 * Strip-theory aerodynamics: every lifting surface is cut into spanwise strips
 * that each see their own local flow (body rates, prop wash, downwash) and
 * look up full-range section polars. Finite-span effects come from a lagged
 * induced angle per surface; the tail feels the wing's downwash with a
 * transport delay.
 */
export class Aerodynamics {
  readonly strips: Strip[] = []
  readonly surfaces: SurfaceState[] = []
  /** Total force and moment about the CG, body frame. */
  readonly force = new Vector3()
  readonly moment = new Vector3()
  private readonly airfoils = new Map<Strip, Airfoil>()
  private readonly wingspan: number
  /** Where each surface sits with its servo centred, rad (a build's rigging error). */
  private readonly neutral: Record<SurfaceChannel, number> = {
    aileron: 0,
    elevator: 0,
    rudder: 0,
    flap: 0,
  }

  constructor(private readonly spec: AircraftSpec) {
    const bySurface = new Map<string, SurfaceState>()
    for (const s of spec.surfaces) {
      const halves = s.mirrored ? 2 : 1
      const area = halves * s.semiSpan * ((s.rootChord + s.tipChord) / 2)
      const span = halves * s.semiSpan
      const source = s.downwashFrom ? bySurface.get(s.downwashFrom) : undefined
      const state: SurfaceState = {
        spec: s,
        area,
        aspectRatio: s.effectiveAspectRatio ?? (span * span) / area,
        cl: 0,
        inducedAngle: 0,
        downwash: 0,
        downwashSource: source,
        downwashLag: source
          ? s.root[2] + s.rootChord / 4 - source.spec.root[2] - source.spec.rootChord / 4
          : 0,
        liftSum: 0,
      }
      bySurface.set(s.name, state)
      this.surfaces.push(state)
      this.buildStrips(state, false)
      if (s.mirrored) this.buildStrips(state, true)
    }
    const wing = spec.surfaces[0]!
    this.wingspan = wing.semiSpan * (wing.mirrored ? 2 : 1)
  }

  /** Rigs each surface off neutral by `build`, the way an untrimmed airframe comes out. */
  setBuildTolerances(build: BuildTolerances): void {
    this.neutral.aileron = build.aileronDeg * DEG
    this.neutral.elevator = build.elevatorDeg * DEG
    this.neutral.rudder = build.rudderDeg * DEG
  }

  reset(): void {
    for (const s of this.surfaces) {
      s.cl = s.inducedAngle = s.downwash = 0
    }
    for (const strip of this.strips) if (strip.control) strip.control.deflection = 0
  }

  update(input: AeroInput): void {
    const { density, airVelocity, bodyRate, centerOfGravity, propulsion } = input
    this.force.set(0, 0, 0)
    this.moment.set(0, 0, 0)
    const freestream = airVelocity.length()

    // Ground effect reduces induced angle and downwash (McCormick).
    const h = Math.max(input.heightAboveGround, 0.01)
    const g = (16 * h) / this.wingspan
    const groundFactor = (g * g) / (1 + g * g)

    for (const s of this.surfaces) {
      s.inducedAngle = (groundFactor * s.cl) / (Math.PI * s.spec.oswald * s.aspectRatio)
      if (s.downwashSource) {
        const src = s.downwashSource
        const target = (groundFactor * 2 * src.cl) / (Math.PI * src.aspectRatio)
        const lag = s.downwashLag / Math.max(freestream, 1)
        s.downwash += (target - s.downwash) * Math.min(1, input.dt / lag)
      }
      s.liftSum = 0
    }

    for (const strip of this.strips) {
      const surface = strip.surface
      // Velocity of the strip relative to the local air.
      lever.subVectors(strip.position, centerOfGravity)
      v.crossVectors(bodyRate, lever).add(airVelocity)
      propulsion.slipstreamAt(strip.position, wash)
      strip.inSlipstream = wash.lengthSq() > 0
      v.addScaledVector(wash, -(surface.spec.slipstreamExposure ?? 1))
      if (surface.downwashSource) v.y += surface.downwash * freestream

      // Drop the spanwise component (cosine rule).
      v.addScaledVector(strip.span, -v.dot(strip.span))
      const speed2 = v.lengthSq()
      strip.force.set(0, 0, 0)
      if (speed2 < 1e-4) {
        strip.alpha = 0
        strip.cl = 0
        continue
      }
      const speed = Math.sqrt(speed2)
      const alpha = Math.atan2(-v.dot(strip.normal), v.dot(strip.forward))
      const alphaEff = alpha - surface.inducedAngle

      // Hinged surface: thin-airfoil lift increment, part of it as a shift
      // of the section's alpha (so a deflected surface stalls a little
      // earlier) and the rest as a direct increment that fades once the
      // section is stalled, plus profile drag and pitching moment.
      let shift = 0
      let dcl = 0
      let dcd = 0
      let dcm = 0
      const control = strip.control
      if (control) {
        const target =
          (input.servos[control.channel] * control.throw + this.neutral[control.channel]) *
          control.gain
        // Linkage backlash: the surface lags the servo within the slop band.
        control.deflection = Math.min(
          target + control.slop,
          Math.max(target - control.slop, control.deflection),
        )
        const d = control.deflection
        const efficiency = flapEfficiency(Math.abs(d))
        const equivalentAlpha = control.tau * efficiency * d
        shift = FLAP_ALPHA_SHIFT * equivalentAlpha
        dcl = FLAP_DIRECT_LIFT * 2 * Math.PI * equivalentAlpha
        dcd = control.chordFraction * Math.sin(d) ** 2
        dcm = control.cmPerRad * efficiency * d
      }

      const sectionAlpha = alphaEff + shift
      const reynolds = (density * speed * strip.chord) / DYNAMIC_VISCOSITY
      this.airfoils.get(strip)!.lookup(sectionAlpha, reynolds, coeffs)
      const attached = attachedFraction(sectionAlpha)
      const cl = coeffs.cl + dcl * attached
      const cd = coeffs.cd + dcd
      const cm = coeffs.cm + dcm
      strip.alpha = alphaEff
      strip.cl = cl
      strip.stalled = attached < 1

      const q = 0.5 * density * speed2
      const area = strip.chord * strip.width
      const sinA = Math.sin(alphaEff)
      const cosA = Math.cos(alphaEff)
      // Lift perpendicular to the effective flow, drag along it.
      liftDir.copy(strip.forward).multiplyScalar(sinA).addScaledVector(strip.normal, cosA)
      dragDir.copy(strip.forward).multiplyScalar(-cosA).addScaledVector(strip.normal, sinA)
      strip.force
        .copy(liftDir)
        .multiplyScalar(q * area * cl)
        .addScaledVector(dragDir, q * area * cd)
      this.force.add(strip.force)
      this.moment.add(tmp.crossVectors(lever, strip.force))
      this.moment.addScaledVector(strip.span, q * area * strip.chord * cm)
      surface.liftSum += cl * area
    }

    for (const s of this.surfaces) {
      // Relaxed update keeps the lagged induced-angle loop smooth.
      s.cl += (s.liftSum / s.area - s.cl) * 0.5
    }

    // Fuselage, gear and struts: axial drag plus crossflow drag.
    for (const body of this.spec.bodies) {
      point.set(...body.position)
      lever.subVectors(point, centerOfGravity)
      v.crossVectors(bodyRate, lever).add(airVelocity)
      v.sub(propulsion.slipstreamAt(point, wash))
      const cross = Math.hypot(v.x, v.y)
      const k = -0.5 * density
      tmp.set(
        k * body.crossflowCd * body.sideArea * cross * v.x,
        k * body.crossflowCd * body.topArea * cross * v.y,
        k * body.axialCdA * Math.abs(v.z) * v.z,
      )
      this.force.add(tmp)
      this.moment.add(lever.cross(tmp))
    }
  }

  private buildStrips(surface: SurfaceState, mirror: boolean): void {
    const s = surface.spec
    const foil = airfoil(s.airfoil)
    const dihedral = s.dihedralDeg * DEG
    const outward = s.vertical
      ? new Vector3(0, 1, 0)
      : new Vector3(Math.cos(dihedral), Math.sin(dihedral), 0)
    const sweep = Math.tan(s.sweepDeg * DEG)
    const width = s.semiSpan / s.strips

    for (let k = 0; k < s.strips; k++) {
      const eta = (k + 0.5) / s.strips
      const chord = s.rootChord + (s.tipChord - s.rootChord) * eta
      const incidence = (s.incidenceDeg + s.twistDeg * eta) * DEG
      const y = eta * s.semiSpan
      const leadingEdge = new Vector3(...s.root)
        .addScaledVector(outward, y)
        .add(new Vector3(0, 0, y * sweep))

      const span = outward.clone()
      const baseNormal = new Vector3().crossVectors(span, new Vector3(0, 0, -1)).normalize()
      const forward = new Vector3(0, 0, -Math.cos(incidence)).addScaledVector(
        baseNormal,
        Math.sin(incidence),
      )
      const normal = new Vector3().crossVectors(span, forward).normalize()
      const position = leadingEdge.addScaledVector(forward, -0.25 * chord)

      if (mirror) {
        position.x *= -1
        forward.x *= -1
        normal.x *= -1
      }
      span.crossVectors(forward, normal).normalize()

      const controlSpec = s.controls.find((c) => eta >= c.spanStart && eta <= c.spanEnd)
      const strip: Strip = {
        surface,
        position,
        chord,
        width,
        forward,
        normal,
        span,
        control: controlSpec ? this.buildControl(s, controlSpec, mirror) : undefined,
        force: new Vector3(),
        alpha: 0,
        cl: 0,
        stalled: false,
        inSlipstream: false,
      }
      this.strips.push(strip)
      this.airfoils.set(strip, foil)
    }
  }

  private buildControl(
    s: LiftingSurfaceSpec,
    c: ControlSurfaceSpec,
    mirror: boolean,
  ): StripControl {
    const hingeChord = c.chordFraction * (s.rootChord + (s.tipChord - s.rootChord) * c.spanStart)
    const throwRad =
      c.throwDeg !== undefined ? c.throwDeg * DEG : Math.atan(c.throwMm! / 1000 / hingeChord)
    const thetaF = Math.acos(2 * c.chordFraction - 1)
    return {
      name: c.name,
      channel: c.channel as SurfaceChannel,
      gain: mirror ? (c.mirrorGain ?? c.gain) : c.gain,
      throw: throwRad,
      tau: 1 - (thetaF - Math.sin(thetaF)) / Math.PI,
      chordFraction: c.chordFraction,
      cmPerRad: -0.5 * Math.sin(thetaF) * (1 - Math.cos(thetaF)),
      slop: (this.spec.servo.slopDeg * DEG) / 2,
      deflection: 0,
    }
  }
}

/**
 * Split of a control surface's lift increment: this fraction of the
 * equivalent alpha change shifts the polar (earlier stall, ~3 deg at full
 * flap); FLAP_DIRECT_LIFT of the thin-airfoil increment is added directly,
 * giving plain-flap dCLmax ~0.8-0.9 at 40 deg (Abbott & von Doenhoff).
 */
const FLAP_ALPHA_SHIFT = 0.2
const FLAP_DIRECT_LIFT = 0.5

/** 1 while the section is attached, fading to 0.3 deep in stall. */
function attachedFraction(alpha: number): number {
  const a = Math.abs(alpha) / DEG
  const folded = a > 90 ? 180 - a : a
  if (folded <= 14) return 1
  return Math.max(0.3, 1 - (0.7 * (folded - 14)) / 26)
}

/** Plain-flap effectiveness falls off past ~10 degrees as the flow separates. */
function flapEfficiency(delta: number): number {
  const deg = delta / DEG
  return deg <= 10 ? 1 : Math.max(0.5, 1 - 0.0125 * (deg - 10))
}

const coeffs: Coefficients = { cl: 0, cd: 0, cm: 0 }
const lever = new Vector3()
const v = new Vector3()
const wash = new Vector3()
const liftDir = new Vector3()
const dragDir = new Vector3()
const tmp = new Vector3()
const point = new Vector3()
