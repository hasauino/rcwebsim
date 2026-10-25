import { Quaternion, Vector3 } from 'three'
import type { Channel, WheelSpec } from './aircraft/types'
import { terrainRaycast } from './field'
import type { Wrench } from './wrench'

const DEG = Math.PI / 180
/** Lateral/rolling forces saturate above this slip speed, m/s. */
const SLIP_SATURATION = 0.05
/**
 * A wheel at rest holds like a stiff spring: its tyre winds up this far, m,
 * before the push reaches its rolling resistance and it breaks away.
 */
const STICK_TRAVEL = 0.002
/** Damping of the held tyre, as a time constant on its stiffness, s. */
const STICK_DAMPING = 0.1
/** A rolling wheel slower than this, m/s, stops and holds again. */
const STICK_SPEED = 0.02
/** Stiffness multiplier once the strut bottoms out. */
const BUMP_STOP = 10

export interface WheelState {
  onGround: boolean
  compression: number
  load: number
}

export interface GearContext {
  position: Vector3
  rotation: Quaternion
  linearVelocity: Vector3
  angularVelocity: Vector3
  centerOfMass: Vector3
  channels: Record<Channel, number>
}

const attach = new Vector3()
const down = new Vector3()
const contact = new Vector3()
const normal = new Vector3()
const pointVel = new Vector3()
const lever = new Vector3()
const forward = new Vector3()
const lateral = new Vector3()
const force = new Vector3()
const tmp = new Vector3()
const windup = new Vector3()
const steerAxis = new Vector3(0, 1, 0)

/**
 * Raycast spring-damper wheels with friction. Each wheel casts from the top of
 * its suspension travel along the body's down axis against the terrain. A
 * wheel at rest holds until a push beats its rolling resistance, so a parked
 * plane stays put in a breeze.
 */
export class LandingGear {
  readonly wheels: WheelState[]
  /** Where each stopped wheel's tyre touches the ground, world frame; null while rolling. */
  private readonly held: (Vector3 | null)[]

  constructor(
    private readonly specs: readonly WheelSpec[],
    /** Current CG, body frame (moves when the CG is set). */
    private readonly cg: Vector3,
  ) {
    this.wheels = specs.map(() => ({ onGround: false, compression: 0, load: 0 }))
    this.held = specs.map(() => null)
  }

  /** Every wheel free to roll, as when the plane is put down somewhere new. */
  reset(): void {
    this.held.fill(null)
  }

  apply(ctx: GearContext, out: Wrench): void {
    const { rotation } = ctx
    down.set(0, -1, 0).applyQuaternion(rotation)

    this.specs.forEach((spec, i) => {
      const state = this.wheels[i]!
      attach
        .set(...spec.attach)
        .applyQuaternion(rotation)
        .add(ctx.position)
      const reach = spec.travel + spec.radius
      const hit = terrainRaycast(attach.x, attach.y, attach.z, down.x, down.y, down.z, reach)
      if (!hit) {
        state.onGround = false
        state.compression = 0
        state.load = 0
        this.held[i] = null
        return
      }

      const compression = reach - hit.distance
      contact.copy(attach).addScaledVector(down, hit.distance)
      normal.set(hit.normal.x, hit.normal.y, hit.normal.z)

      lever.subVectors(contact, ctx.centerOfMass)
      pointVel.crossVectors(ctx.angularVelocity, lever).add(ctx.linearVelocity)
      const compressionRate = pointVel.dot(down)

      const overTravel = Math.max(0, compression - spec.travel)
      const spring = spec.springRate * (compression + BUMP_STOP * overTravel)
      const load = Math.max(0, spring + spec.damping * compressionRate)

      // Wheel rolling direction, steered about the body's up axis. Steering
      // is signed so a positive channel always yaws the nose right: wheels
      // behind the CG point left, wheels ahead point right.
      forward.set(0, 0, -1)
      if (spec.steering) {
        const behind = spec.attach[2] > this.cg.z ? 1 : -1
        const angle = behind * ctx.channels[spec.steering.channel] * spec.steering.maxDeg * DEG
        forward.applyAxisAngle(steerAxis, angle)
      }
      forward.applyQuaternion(rotation)
      forward.addScaledVector(normal, -forward.dot(normal)).normalize()
      lateral.crossVectors(normal, forward)

      const vForward = pointVel.dot(forward)
      const vLateral = pointVel.dot(lateral)
      const rolling = this.rolling(i, spec, load, vForward)
      const side = -spec.lateralFriction * load * Math.tanh(vLateral / SLIP_SATURATION)

      force
        .copy(normal)
        .multiplyScalar(load)
        .add(tmp.copy(forward).multiplyScalar(rolling))
        .add(tmp.copy(lateral).multiplyScalar(side))
      out.addAtPoint(force, contact, ctx.centerOfMass)

      state.onGround = true
      state.compression = compression
      state.load = load
    })
  }

  /**
   * Rolling resistance along the wheel's heading. A stopped wheel holds where
   * it stopped, winding its tyre up against the push, until the push reaches
   * rollingResistance x load; then it breaks away and rolls against that much
   * resistance until it slows to a stop again. Uses `contact` and `forward`.
   */
  private rolling(i: number, spec: WheelSpec, load: number, vForward: number): number {
    const limit = spec.rollingResistance * load
    const held = this.held[i]
    if (held) {
      const stiffness = limit / STICK_TRAVEL
      const wound = windup.subVectors(contact, held).dot(forward)
      const hold = -stiffness * (wound + STICK_DAMPING * vForward)
      if (Math.abs(hold) <= limit) return hold
      this.held[i] = null
      return Math.sign(hold) * limit
    }
    if (Math.abs(vForward) < STICK_SPEED) this.held[i] = contact.clone()
    return -limit * Math.tanh(vForward / SLIP_SATURATION)
  }
}
