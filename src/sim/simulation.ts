import { Euler, Quaternion, Vector3 } from 'three'
import type { EventQueue, RigidBody, World } from '@dimforge/rapier3d-compat'
import type { AircraftSpec, Channel } from './aircraft/types'
import { Aerodynamics, type Strip } from './aero'
import { airDensity } from './atmosphere'
import { FIELD, terrainHeight, treeLayout } from './field'
import { passThrough, type FlightController } from './flight-controller'
import { LandingGear } from './gear'
import { loadPhysics, type Rapier } from './physics'
import { Propulsion } from './propulsion'
import { Servos } from './servos'
import { Wind } from './wind'
import { Wrench } from './wrench'

const DEG = Math.PI / 180

/** Receiver channel outputs: surfaces -1..1, throttle and flap 0..1. */
export type ControlInputs = Record<Channel, number>

export interface WindSettings {
  /** Mean wind speed, m/s. */
  speed: number
  /** Direction the wind blows from, degrees true (0 = north, 90 = east). */
  fromDeg: number
  /** Turbulence intensity multiplier, 0 = smooth air, 1 = typical. */
  turbulence: number
}

export type Spawn = { kind: 'runway' } | { kind: 'air'; altitude?: number; speed?: number }

export interface SimulationOptions {
  aircraft: AircraftSpec
  seed?: number
  wind?: WindSettings
  spawn?: Spawn
  flightController?: FlightController
}

export interface Vec3Like {
  x: number
  y: number
  z: number
}

export interface AircraftState {
  time: number
  /** Body datum position (wing root leading edge), world frame. */
  position: Vec3Like
  quaternion: { x: number; y: number; z: number; w: number }
  velocity: Vec3Like
  angularVelocity: Vec3Like
  crashed: boolean
}

export interface Telemetry {
  pitchDeg: number
  /** Positive = right wing down. */
  rollDeg: number
  headingDeg: number
  /** Positive = rolling right. */
  rollRateDeg: number
  /** Positive = nose pitching up. */
  pitchRateDeg: number
  /** Positive = nose yawing right. */
  yawRateDeg: number
  /** True airspeed, m/s. */
  airspeed: number
  groundSpeed: number
  /** Angle of attack and sideslip at the CG, degrees. */
  alphaDeg: number
  betaDeg: number
  /** CG height above the terrain, m. */
  altitude: number
  verticalSpeed: number
  /** Body-normal specific force in g (1 in level flight). */
  loadFactor: number
  wheelsOnGround: boolean[]
  /** Prop thrust along the thrust line, N. */
  thrust: number
  rpm: number
  /** Motor current, A. */
  current: number
  /** Battery terminal voltage, V. */
  voltage: number
  /** Battery state of charge 0..1. */
  batteryLevel: number
  /** Surface deflections in degrees, keyed "control.side" (e.g. "aileron.left"). */
  deflections: Record<string, number>
  /** Wind including gusts at the aircraft, world frame, m/s. */
  wind: Vec3Like
  /** Accumulated prop rotation, rad (for rendering). */
  propAngle: number
  crashed: boolean
}

export const DEFAULT_WIND: WindSettings = { speed: 3, fromDeg: 90, turbulence: 1 }

export async function createSimulation(options: SimulationOptions): Promise<Simulation> {
  return new Simulation(await loadPhysics(), options)
}

const position = new Vector3()
const rotation = new Quaternion()
const linearVelocity = new Vector3()
const angularVelocity = new Vector3()
const centerOfMass = new Vector3()
const inverseRotation = new Quaternion()
const airVelocity = new Vector3()
const bodyAirVelocity = new Vector3()
const bodyRate = new Vector3()
const hubVelocity = new Vector3()
const worldForce = new Vector3()
const worldPoint = new Vector3()
const worldMoment = new Vector3()
const tmp = new Vector3()

export class Simulation {
  /** Fixed physics step, s (500 Hz). */
  readonly dt = 1 / 500
  readonly aircraft: AircraftSpec

  private readonly world: World
  private readonly events: EventQueue
  private readonly body: RigidBody
  private readonly gear: LandingGear
  private readonly propulsion: Propulsion
  private readonly aero: Aerodynamics
  private readonly servos: Servos
  private readonly flightController: FlightController
  private readonly wind: Wind
  private readonly wrench = new Wrench()
  private readonly cg: Vector3
  private readonly wingRoot: Vector3
  private time = 0
  private crashed = false
  private propAngle = 0
  private loadFactor = 1

  constructor(
    private readonly rapier: Rapier,
    options: SimulationOptions,
  ) {
    this.aircraft = options.aircraft
    this.cg = new Vector3(...this.aircraft.centerOfGravity)
    this.wingRoot = new Vector3(...this.aircraft.surfaces[0]!.root)
    this.world = new rapier.World({ x: 0, y: -9.81, z: 0 })
    this.world.timestep = this.dt
    this.events = new rapier.EventQueue(true)
    this.buildField()
    // Scene queries only see colliders after a step.
    this.world.step()
    this.body = this.buildAircraft()
    this.gear = new LandingGear(this.aircraft.wheels, this.cg.z)
    this.propulsion = new Propulsion(this.aircraft)
    this.aero = new Aerodynamics(this.aircraft)
    this.servos = new Servos(this.aircraft.servo)
    this.flightController = options.flightController ?? passThrough
    this.wind = new Wind(options.seed ?? 1)
    this.setWind(options.wind ?? DEFAULT_WIND)
    this.reset(options.spawn)
  }

  /** Advances one fixed step with the given receiver outputs. */
  step(inputs: ControlInputs): void {
    const dt = this.dt
    this.readBody()
    this.wrench.clear()

    // Air-relative motion in the body frame.
    const height = centerOfMass.y - terrainHeight(centerOfMass.x, centerOfMass.z)
    const wind = this.wind.update(
      dt,
      height,
      airVelocity.subVectors(linearVelocity, this.wind.velocity).length(),
    )
    inverseRotation.copy(rotation).invert()
    airVelocity.subVectors(linearVelocity, wind)
    bodyAirVelocity.copy(airVelocity).applyQuaternion(inverseRotation)
    bodyRate.copy(angularVelocity).applyQuaternion(inverseRotation)
    const density = airDensity(position.y)

    // Receiver -> flight controller -> servos.
    const channels = this.flightController.update(
      inputs,
      {
        bodyRate,
        pitchDeg: 0,
        rollDeg: 0,
        airspeed: bodyAirVelocity.length(),
      },
      dt,
    )
    this.servos.update(channels, dt)

    // Powertrain and prop.
    const prop = this.propulsion
    hubVelocity.copy(bodyRate).cross(tmp.subVectors(prop.hub, this.cg)).add(bodyAirVelocity)
    const thrust = prop.update({
      dt,
      throttle: this.crashed ? 0 : channels.throttle,
      hubAirVelocity: hubVelocity,
      bodyRate,
      density,
    })
    this.propAngle = (this.propAngle + prop.omega * dt) % (Math.PI * 2)
    this.addBodyLoad(thrust.force, prop.hub, thrust.moment)

    // Airframe aerodynamics.
    worldPoint.copy(this.wingRoot).applyQuaternion(rotation).add(position)
    this.aero.update({
      dt,
      density,
      airVelocity: bodyAirVelocity,
      bodyRate,
      centerOfGravity: this.cg,
      propulsion: prop,
      heightAboveGround: worldPoint.y - terrainHeight(worldPoint.x, worldPoint.z),
      servos: this.servos.position,
    })
    worldForce.copy(this.aero.force).applyQuaternion(rotation)
    this.wrench.force.add(worldForce)
    this.wrench.torque.add(worldMoment.copy(this.aero.moment).applyQuaternion(rotation))

    this.gear.apply(
      { position, rotation, linearVelocity, angularVelocity, centerOfMass, channels },
      this.wrench,
    )

    this.loadFactor =
      this.wrench.force.dot(tmp.set(0, 1, 0).applyQuaternion(rotation)) /
      (this.aircraft.mass * 9.81)

    this.body.resetForces(false)
    this.body.resetTorques(false)
    this.body.addForce(this.wrench.force, true)
    this.body.addTorque(this.wrench.torque, true)
    this.world.step(this.events)
    this.events.drainContactForceEvents((e) => {
      if (e.totalForceMagnitude() > this.aircraft.crashForce) this.crashed = true
    })
    this.time += dt
  }

  setWind(wind: WindSettings): void {
    this.wind.set(wind.speed, wind.fromDeg, wind.turbulence)
  }

  /** Restarts the flight. A new `seed` changes the turbulence sequence. */
  reset(spawn: Spawn = { kind: 'runway' }, seed?: number): void {
    this.time = 0
    this.crashed = false
    this.propAngle = 0
    this.propulsion.reset()
    this.aero.reset()
    this.servos.reset()
    this.flightController.reset()
    this.wind.reset(seed)
    const q = new Quaternion()
    const p = new Vector3()
    const { x, z, headingDeg } = FIELD.runwayStart
    if (spawn.kind === 'runway') {
      q.setFromEuler(new Euler(this.groundPitch(), -headingDeg * DEG, 0, 'YXZ'))
      // Lift the datum until the lowest wheel just touches the ground.
      const lowest = Math.min(
        ...this.aircraft.wheels.map(
          (w) =>
            tmp.set(w.attach[0], w.attach[1] - w.travel - w.radius, w.attach[2]).applyQuaternion(q)
              .y,
        ),
      )
      p.set(x, terrainHeight(x, z) - lowest + 0.002, z)
      this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    } else {
      // Downwind of the runway, flying the circuit east.
      const altitude = spawn.altitude ?? 40
      const speed = spawn.speed ?? 15
      q.setFromEuler(new Euler(2 * DEG, -headingDeg * DEG, 0, 'YXZ'))
      p.set(x - 60, terrainHeight(x - 60, z - 80) + altitude, z - 80)
      this.body.setLinvel(tmp.set(0, 0, -speed).applyQuaternion(q), true)
    }
    this.body.setTranslation(p, true)
    this.body.setRotation(q, true)
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    this.body.resetForces(true)
    this.body.resetTorques(true)
  }

  state(): AircraftState {
    const t = this.body.translation()
    const r = this.body.rotation()
    const v = this.body.linvel()
    const w = this.body.angvel()
    return {
      time: this.time,
      position: { x: t.x, y: t.y, z: t.z },
      quaternion: { x: r.x, y: r.y, z: r.z, w: r.w },
      velocity: { x: v.x, y: v.y, z: v.z },
      angularVelocity: { x: w.x, y: w.y, z: w.z },
      crashed: this.crashed,
    }
  }

  telemetry(): Telemetry {
    this.readBody()
    const fwd = new Vector3(0, 0, -1).applyQuaternion(rotation)
    const right = new Vector3(1, 0, 0).applyQuaternion(rotation)
    const up = new Vector3(0, 1, 0).applyQuaternion(rotation)
    const inv = rotation.clone().invert()
    const air = linearVelocity.clone().sub(this.wind.velocity).applyQuaternion(inv)
    const rate = angularVelocity.clone().applyQuaternion(inv)
    const airspeed = air.length()

    const deflections: Record<string, number> = {}
    for (const strip of this.aero.strips) {
      const c = strip.control
      if (!c) continue
      const side = strip.position.x > 1e-6 ? 'right' : strip.position.x < -1e-6 ? 'left' : 'center'
      deflections[`${c.name}.${side}`] ??= c.deflection / DEG
    }

    return {
      pitchDeg: Math.atan2(fwd.y, Math.hypot(fwd.x, fwd.z)) / DEG,
      rollDeg: Math.atan2(-right.y, up.y) / DEG,
      headingDeg: (Math.atan2(fwd.x, -fwd.z) / DEG + 360) % 360,
      rollRateDeg: -rate.z / DEG,
      pitchRateDeg: rate.x / DEG,
      yawRateDeg: -rate.y / DEG,
      airspeed,
      groundSpeed: Math.hypot(linearVelocity.x, linearVelocity.z),
      alphaDeg: airspeed > 0.5 ? Math.atan2(-air.y, -air.z) / DEG : 0,
      betaDeg: airspeed > 0.5 ? Math.asin(air.x / airspeed) / DEG : 0,
      altitude: centerOfMass.y - terrainHeight(centerOfMass.x, centerOfMass.z),
      verticalSpeed: linearVelocity.y,
      loadFactor: this.loadFactor,
      wheelsOnGround: this.gear.wheels.map((w) => w.onGround),
      thrust: this.propulsion.thrust,
      rpm: this.propulsion.rpm,
      current: this.propulsion.current,
      voltage: this.propulsion.voltage,
      batteryLevel: this.propulsion.soc,
      deflections,
      propAngle: this.propAngle,
      wind: { x: this.wind.velocity.x, y: this.wind.velocity.y, z: this.wind.velocity.z },
      crashed: this.crashed,
    }
  }

  /** Per-strip aerodynamic state for the debug overlay (body frame). */
  strips(): readonly Strip[] {
    return this.aero.strips
  }

  dispose(): void {
    this.events.free()
    this.world.free()
  }

  private addBodyLoad(force: Vector3, point: Vector3, moment: Vector3): void {
    worldForce.copy(force).applyQuaternion(rotation)
    worldPoint.copy(point).applyQuaternion(rotation).add(position)
    this.wrench.addAtPoint(worldForce, worldPoint, centerOfMass)
    this.wrench.torque.add(worldMoment.copy(moment).applyQuaternion(rotation))
  }

  /** Nose-up angle at which the front-most and rear-most wheels touch together. */
  private groundPitch(): number {
    const bottoms = this.aircraft.wheels.map((w) => ({
      y: w.attach[1] - w.travel - w.radius,
      z: w.attach[2],
    }))
    const front = bottoms.reduce((a, b) => (b.z < a.z ? b : a))
    const rear = bottoms.reduce((a, b) => (b.z > a.z ? b : a))
    if (front.z === rear.z) return 0
    return Math.atan((front.y - rear.y) / (front.z - rear.z))
  }

  private readBody(): void {
    const t = this.body.translation()
    const r = this.body.rotation()
    const v = this.body.linvel()
    const w = this.body.angvel()
    position.set(t.x, t.y, t.z)
    rotation.set(r.x, r.y, r.z, r.w)
    linearVelocity.set(v.x, v.y, v.z)
    angularVelocity.set(w.x, w.y, w.z)
    centerOfMass.copy(this.cg).applyQuaternion(rotation).add(position)
  }

  private buildField(): void {
    const { rapier, world } = this
    const n = FIELD.resolution - 1
    const heights = new Float32Array(FIELD.resolution * FIELD.resolution)
    const cell = FIELD.size / n
    // Column-major: rows run along z, columns along x.
    for (let col = 0; col <= n; col++) {
      for (let row = 0; row <= n; row++) {
        heights[row + col * (n + 1)] = terrainHeight(
          -FIELD.size / 2 + col * cell,
          -FIELD.size / 2 + row * cell,
        )
      }
    }
    world.createCollider(
      rapier.ColliderDesc.heightfield(n, n, heights, {
        x: FIELD.size,
        y: 1,
        z: FIELD.size,
      }).setFriction(0.7),
    )
    for (const tree of treeLayout()) {
      const ground = terrainHeight(tree.x, tree.z)
      const trunk = tree.height * 0.45
      world.createCollider(
        rapier.ColliderDesc.capsule(trunk / 2, tree.trunkRadius).setTranslation(
          tree.x,
          ground + trunk / 2,
          tree.z,
        ),
      )
      world.createCollider(
        rapier.ColliderDesc.ball(tree.canopyRadius).setTranslation(
          tree.x,
          ground + tree.height - tree.canopyRadius,
          tree.z,
        ),
      )
    }
  }

  private buildAircraft(): RigidBody {
    const { rapier, world, aircraft } = this
    const body = world.createRigidBody(
      rapier.RigidBodyDesc.dynamic()
        .setAdditionalMassProperties(
          aircraft.mass,
          { x: this.cg.x, y: this.cg.y, z: this.cg.z },
          { x: aircraft.inertia[0], y: aircraft.inertia[1], z: aircraft.inertia[2] },
          { x: 0, y: 0, z: 0, w: 1 },
        )
        .setCcdEnabled(true)
        .setCanSleep(false),
    )
    for (const shape of aircraft.collision) {
      world.createCollider(
        rapier.ColliderDesc.cuboid(...shape.halfExtents)
          .setTranslation(...shape.position)
          .setDensity(0)
          .setFriction(0.5)
          .setActiveEvents(rapier.ActiveEvents.CONTACT_FORCE_EVENTS)
          .setContactForceEventThreshold(aircraft.crashForce),
        body,
      )
    }
    return body
  }
}
