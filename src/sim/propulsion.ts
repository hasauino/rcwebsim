import { Vector3 } from 'three'
import type { AircraftSpec } from './aircraft/types'
import { airfoil, type Airfoil, type Coefficients } from './airfoil'
import { DYNAMIC_VISCOSITY } from './atmosphere'

const DEG = Math.PI / 180
const RPM_PER_RAD_S = 60 / (2 * Math.PI)
const AZIMUTHS = 8
const RADIAL_STATIONS = 8
const HUB_FRACTION = 0.15
/** Time constant of the induced inflow responding to thrust changes, s. */
const INFLOW_LAG = 0.02
/** Swirl evaluated at this fraction of tip radius. */
const SWIRL_RADIUS = 0.7
/**
 * Non-uniform inflow raises induced power over ideal momentum theory
 * (kappa ~1.1-1.2 for propellers and rotors).
 */
const INDUCED_POWER_FACTOR = 1.15
/**
 * Section drag multiplier: real RC blades have thick roots, roughness and
 * low-Re 3D effects that clean 2D XFoil polars miss. Calibrated so static
 * CP lands near published APC 12x8E data (~0.045-0.05).
 */
const PROFILE_DRAG_FACTOR = 1.5

export interface PropulsionInput {
  dt: number
  throttle: number
  /** Velocity of the hub through the air, body frame (includes rotation). */
  hubAirVelocity: Vector3
  /** Body angular velocity, body frame. */
  bodyRate: Vector3
  density: number
}

/** What the propulsion system hands to the airframe this step, body frame. */
export interface PropulsionOutput {
  /** Force on the airframe at the hub. */
  force: Vector3
  /** Moment on the airframe (about the hub): P-factor, torque reaction, gyro. */
  moment: Vector3
}

/**
 * Electric powertrain: LiPo pack -> ESC -> outrunner -> blade-element prop.
 * The prop is integrated over fixed azimuth stations, so asymmetric inflow
 * (P-factor) and prop normal force fall out of the model rather than being
 * bolted on.
 */
export class Propulsion {
  /** Prop speed, rad/s (>= 0). */
  omega = 0
  /** Battery state of charge 0..1. */
  soc = 1
  /** Uniform induced velocity at the disc, m/s. */
  inducedVelocity = 0
  thrust = 0
  torque = 0
  current = 0
  voltage = 0
  /** Axial speed through the disc at the last update, m/s. */
  axialSpeed = 0

  readonly axis = new Vector3()
  readonly spin = new Vector3()
  readonly hub: Vector3
  readonly radius: number
  readonly output: PropulsionOutput = { force: new Vector3(), moment: new Vector3() }

  private readonly blade: Airfoil
  private readonly e1 = new Vector3()
  private readonly e2 = new Vector3()
  private readonly stations: { r: number; dr: number; chord: number; pitch: number }[]
  private readonly kt: number
  private lvcScale = 1
  private density = 1.225

  constructor(private readonly spec: AircraftSpec) {
    const p = spec.propeller
    this.radius = p.diameter / 2
    this.hub = new Vector3(...p.position)
    const rt = p.rightThrustDeg * DEG
    const dn = p.downThrustDeg * DEG
    this.axis.set(Math.sin(rt) * Math.cos(dn), -Math.sin(dn), -Math.cos(rt) * Math.cos(dn))
    this.axis.normalize()
    this.spin.copy(this.axis).multiplyScalar(p.clockwiseFromBehind ? 1 : -1)
    // In-plane basis.
    this.e1.set(1, 0, 0).addScaledVector(this.axis, -this.axis.x).normalize()
    this.e2.crossVectors(this.axis, this.e1)
    this.blade = airfoil(p.airfoil)
    this.kt = 1 / ((spec.motor.kv * 2 * Math.PI) / 60)

    const span = this.radius * (1 - HUB_FRACTION)
    const dr = span / RADIAL_STATIONS
    this.stations = Array.from({ length: RADIAL_STATIONS }, (_, j) => {
      const r = this.radius * HUB_FRACTION + (j + 0.5) * dr
      return {
        r,
        dr,
        chord: this.radius * interpolate(p.chordDistribution, r / this.radius),
        pitch: Math.atan(p.pitch / (2 * Math.PI * r)),
      }
    })
  }

  get rpm(): number {
    return this.omega * RPM_PER_RAD_S
  }

  reset(): void {
    this.omega = 0
    this.soc = 1
    this.inducedVelocity = 0
    this.thrust = this.torque = this.current = 0
    this.voltage = this.openCircuitVoltage()
    this.lvcScale = 1
  }

  update(input: PropulsionInput): PropulsionOutput {
    const { dt, density } = input
    const { motor, battery, esc, propeller } = this.spec

    // --- Electrical: battery -> ESC -> motor (algebraic; electrical time
    // constants are far below the 2 ms step).
    const duty = Math.min(Math.max(input.throttle, 0), 1) * this.lvcScale
    const packResistance = battery.cells * battery.cellResistance
    const ocv = this.openCircuitVoltage()
    const backEmf = this.omega * this.kt
    let current = (duty * ocv - backEmf) / (motor.resistance + duty * duty * packResistance)
    current = Math.min(Math.max(current, 0), esc.currentLimit)
    if (duty === 0) current = 0
    const batteryCurrent = duty * current
    this.voltage = ocv - batteryCurrent * packResistance
    this.current = current
    this.soc = Math.max(0, this.soc - (batteryCurrent * dt) / (battery.capacityMah * 3.6))

    // Low-voltage cutoff: progressively pull power when the cells sag.
    const cell = this.voltage / battery.cells
    const target = Math.min(1, Math.max(0, 1 - (esc.lowVoltageCutoff - cell) / 0.3))
    this.lvcScale += (target - this.lvcScale) * Math.min(1, dt / 0.5)

    const friction = this.kt * motor.noLoadCurrent * Math.tanh(this.omega / 20)
    const motorTorque = this.kt * current - friction

    // --- Aerodynamics of the prop.
    this.density = density
    const aero = this.bladeElements(input.hubAirVelocity, density, dt)

    // Shaft dynamics.
    this.omega = Math.max(0, this.omega + (dt * (motorTorque - this.torque)) / propeller.inertia)

    // --- Loads on the airframe.
    const out = this.output
    out.force.copy(aero.force)
    // Off-axis prop moments (P-factor) pass through the bearings; the axial
    // aero torque acts on the prop, the motor reacts on the airframe.
    out.moment.copy(aero.moment).addScaledVector(this.spin, -aero.moment.dot(this.spin))
    out.moment.addScaledVector(this.spin, -motorTorque)
    // Gyroscopic reaction of the spinning prop to body rotation.
    gyro.copy(this.spin).multiplyScalar(propeller.inertia * this.omega)
    out.moment.sub(tmp.crossVectors(input.bodyRate, gyro))
    return out
  }

  /**
   * Slipstream velocity (air moving backwards along -axis, plus swirl) at a
   * body-frame point, written into `out`. Zero outside the contracted tube.
   */
  slipstreamAt(point: Vector3, out: Vector3): Vector3 {
    out.set(0, 0, 0)
    const vi = this.inducedVelocity
    if (vi <= 0) return out
    rel.subVectors(point, this.hub)
    const x = -rel.dot(this.axis)
    if (x < 0) return out
    radial.copy(rel).addScaledVector(this.axis, x)
    const r = radial.length()
    const R = this.radius
    const develop = 1 + x / Math.sqrt(x * x + R * R)
    const local = vi * develop
    const va = Math.max(this.axialSpeed, 0)
    const tube = R * Math.sqrt((va + vi) / Math.max(va + local, 1e-3))
    if (r > tube) return out
    // Soft edge over the outer 15% of the tube.
    const edge = Math.min(1, (tube - r) / (0.15 * tube))
    out.copy(this.axis).multiplyScalar(-local * edge)

    // Swirl from angular momentum conservation, same sense as the prop.
    const massFlow = Math.PI * R * R * (va + vi)
    if (r > 1e-3 && massFlow > 0) {
      const swirl = this.torque / (this.density * massFlow * SWIRL_RADIUS * R)
      tangent.crossVectors(this.spin, radial).normalize()
      out.addScaledVector(tangent, Math.min(swirl, local) * edge)
    }
    return out
  }

  private bladeElements(hubVelocity: Vector3, density: number, dt: number) {
    const R = this.radius
    const B = this.spec.propeller.blades
    const omega = this.omega
    const weight = B / AZIMUTHS
    force.set(0, 0, 0)
    moment.set(0, 0, 0)

    this.axialSpeed = hubVelocity.dot(this.axis)
    for (let k = 0; k < AZIMUTHS; k++) {
      const psi = (2 * Math.PI * k) / AZIMUTHS
      er.copy(this.e1).multiplyScalar(Math.cos(psi)).addScaledVector(this.e2, Math.sin(psi))
      et.crossVectors(this.spin, er)
      for (const s of this.stations) {
        u.copy(hubVelocity)
          .addScaledVector(et, omega * s.r)
          .addScaledVector(this.axis, this.inducedVelocity * INDUCED_POWER_FACTOR)
        const ut = u.dot(et)
        const up = u.dot(this.axis)
        const w2 = ut * ut + up * up
        if (w2 < 1e-6) continue
        const w = Math.sqrt(w2)
        const phi = Math.atan2(up, ut)
        this.blade.lookup(s.pitch - phi, (density * w * s.chord) / DYNAMIC_VISCOSITY, coeffs)
        const sinPhi = Math.abs(Math.sin(phi))
        const tipLoss =
          sinPhi > 1e-3
            ? (2 / Math.PI) * Math.acos(Math.exp((-B * (R - s.r)) / (2 * s.r * sinPhi)))
            : 1
        const q = 0.5 * density * w2 * s.chord * s.dr * weight
        const lift = q * coeffs.cl * tipLoss
        const drag = q * coeffs.cd * PROFILE_DRAG_FACTOR
        // Lift is perpendicular to the relative wind in the (et, axis) plane.
        element
          .copy(this.axis)
          .multiplyScalar((lift * ut - drag * up) / w)
          .addScaledVector(et, (-lift * up - drag * ut) / w)
        force.add(element)
        moment.add(tmp.copy(er).multiplyScalar(s.r).cross(element))
      }
    }

    this.thrust = force.dot(this.axis)
    this.torque = -moment.dot(this.spin)

    // Momentum theory (Glauert) for the uniform induced velocity, lagged to
    // act like dynamic inflow.
    const area = Math.PI * R * R
    const va = this.axialSpeed
    const inPlane = Math.sqrt(Math.max(hubVelocity.lengthSq() - va * va, 0))
    let v = Math.max(this.inducedVelocity, 0.1)
    for (let i = 0; i < 4; i++) {
      const s = Math.sqrt((va + v) ** 2 + inPlane ** 2) || 1e-6
      const g = 2 * density * area * v * s - this.thrust
      const dg = 2 * density * area * (s + (v * (va + v)) / s)
      v = Math.max(v - g / dg, -Math.max(va, 0) / 2)
    }
    this.inducedVelocity += (v - this.inducedVelocity) * Math.min(1, dt / INFLOW_LAG)
    return { force, moment }
  }

  private openCircuitVoltage(): number {
    return this.spec.battery.cells * interpolate(this.spec.battery.ocvCurve, this.soc)
  }
}

function interpolate(table: readonly (readonly [number, number])[], x: number): number {
  const first = table[0]!
  const last = table[table.length - 1]!
  if (x <= first[0]) return first[1]
  if (x >= last[0]) return last[1]
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i]!
    const [x0, y0] = table[i - 1]!
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
  }
  return last[1]
}

const coeffs: Coefficients = { cl: 0, cd: 0, cm: 0 }
const force = new Vector3()
const moment = new Vector3()
const element = new Vector3()
const er = new Vector3()
const et = new Vector3()
const u = new Vector3()
const tmp = new Vector3()
const gyro = new Vector3()
const rel = new Vector3()
const radial = new Vector3()
const tangent = new Vector3()
