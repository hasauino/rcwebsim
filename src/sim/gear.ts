import { Quaternion, Vector3 } from 'three'
import type { Channel, WheelSpec } from './aircraft/types'
import { terrainRaycast } from './field'
import type { Wrench } from './wrench'

const DEG = Math.PI / 180
/** Lateral/rolling forces saturate above this slip speed, m/s. */
const SLIP_SATURATION = 0.05
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
const steerAxis = new Vector3(0, 1, 0)

/**
 * Raycast spring-damper wheels with friction. Each wheel casts from the top of
 * its suspension travel along the body's down axis against the terrain.
 */
export class LandingGear {
  readonly wheels: WheelState[]

  constructor(
    private readonly specs: readonly WheelSpec[],
    private readonly cgZ: number,
  ) {
    this.wheels = specs.map(() => ({ onGround: false, compression: 0, load: 0 }))
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
        const behind = spec.attach[2] > this.cgZ ? 1 : -1
        const angle = behind * ctx.channels[spec.steering.channel] * spec.steering.maxDeg * DEG
        forward.applyAxisAngle(steerAxis, angle)
      }
      forward.applyQuaternion(rotation)
      forward.addScaledVector(normal, -forward.dot(normal)).normalize()
      lateral.crossVectors(normal, forward)

      const vForward = pointVel.dot(forward)
      const vLateral = pointVel.dot(lateral)
      const rolling = -spec.rollingResistance * load * Math.tanh(vForward / SLIP_SATURATION)
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
}
