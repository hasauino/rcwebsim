/**
 * Test pilots and flight-envelope scenarios shared by the aircraft envelope
 * tests. Each scenario flies one manoeuvre the way it is flight-tested and
 * returns what was measured; the bands it must fall in live with each
 * aircraft's tests, next to their evidence (ADR-0004).
 */
import type { AircraftSpec } from './aircraft/types'
import { createSimulation, type ControlInputs, type Simulation } from './simulation'

export const idle: ControlInputs = { aileron: 0, elevator: 0, rudder: 0, throttle: 0, flap: 0 }
export const calm = { speed: 0, fromDeg: 0, turbulence: 0 }

const clamp = (v: number) => Math.max(-1, Math.min(1, v))
/** Signed heading change from `from` to `to`, -180..180 deg. */
export const headingError = (from: number, to: number) => ((to - from + 540) % 360) - 180

export function run(sim: Simulation, seconds: number, inputs: (sim: Simulation) => ControlInputs) {
  const steps = Math.round(seconds / sim.dt)
  for (let i = 0; i < steps; i++) sim.step(inputs(sim))
}

/** A minimal test pilot: wings-level and heading hold via ailerons/rudder. */
export function wingsLevel(sim: Simulation, extra: Partial<ControlInputs> = {}): ControlInputs {
  const t = sim.telemetry()
  const aileron = clamp(-0.04 * t.rollDeg - 0.01 * t.rollRateDeg)
  return { ...idle, aileron, ...extra }
}

/** Test pilot: wings level plus altitude hold on the elevator. */
export function holdAltitude(target: number, extra: Partial<ControlInputs> = {}) {
  return (sim: Simulation): ControlInputs => {
    const t = sim.telemetry()
    const elevator = 0.08 * (target - t.altitude) - 0.12 * t.verticalSpeed - 0.01 * t.pitchRateDeg
    return wingsLevel(sim, { elevator: clamp(elevator), ...extra })
  }
}

/** Mean airspeed, distance flown and height gained over `seconds`. */
export function average(
  sim: Simulation,
  seconds: number,
  inputs: (sim: Simulation) => ControlInputs,
) {
  const steps = Math.round(seconds / sim.dt)
  const start = sim.state()
  let airspeed = 0
  for (let i = 0; i < steps; i++) {
    sim.step(inputs(sim))
    airspeed += sim.telemetry().airspeed / steps
  }
  const end = sim.state()
  const horizontal = Math.hypot(
    end.position.x - start.position.x,
    end.position.z - start.position.z,
  )
  const climb = end.position.y - start.position.y
  return { airspeed, horizontal, climb, seconds }
}

/** Sits on the runway at idle: the settled attitude, and how far it creeps. */
export async function settle(aircraft: AircraftSpec) {
  const sim = await createSimulation({ aircraft, wind: calm })
  run(sim, 1, () => idle)
  const settled = sim.telemetry()
  const start = sim.state().position
  run(sim, 3, () => idle)
  const t = sim.telemetry()
  const end = sim.state().position
  return {
    telemetry: t,
    drift: Math.hypot(end.x - start.x, end.z - start.z),
    pitchChange: Math.abs(t.pitchDeg - settled.pitchDeg),
    crashed: sim.state().crashed,
  }
}

/** Telemetry after 0.6 s at full throttle on the ground. */
export async function staticRun(aircraft: AircraftSpec) {
  const sim = await createSimulation({ aircraft, wind: calm })
  run(sim, 0.6, () => ({ ...idle, throttle: 1 }))
  return sim.telemetry()
}

/** Runs up to full power, then closes the throttle for a second. */
export async function freewheel(aircraft: AircraftSpec) {
  const sim = await createSimulation({ aircraft, wind: calm })
  run(sim, 0.6, () => ({ ...idle, throttle: 1 }))
  const fullRpm = sim.telemetry().rpm
  run(sim, 1, () => idle)
  // No power, so the prop slows to at most windmilling speed (~V / pitch).
  const v = sim.state().velocity
  const windmillRpm = (Math.hypot(v.x, v.y, v.z) / aircraft.propeller.pitch) * 60
  return { fullRpm, windmillRpm, rpm: sim.telemetry().rpm, current: sim.telemetry().current }
}

/**
 * Full-power takeoff from the runway, flown taildragger style: rudder holds
 * the heading, tail up at `tailUpPitch` for the roll, then rotate to
 * `climbPitch` at `rotateSpeed`. Liftoff counts once airborne for a second.
 */
export async function takeoff(
  aircraft: AircraftSpec,
  technique: { tailUpPitch: number; rotateSpeed: number; climbPitch: number },
) {
  const sim = await createSimulation({ aircraft, wind: calm })
  const start = sim.state().position
  const heading = sim.telemetry().headingDeg
  let liftoff: number | undefined
  let airborneFor = 0
  let worstHeadingError = 0
  for (let i = 0; i < 10 / sim.dt && airborneFor < 1; i++) {
    const t = sim.telemetry()
    const error = headingError(t.headingDeg, heading)
    worstHeadingError = Math.max(worstHeadingError, Math.abs(error))
    const rudder = clamp(0.15 * error - 0.03 * t.yawRateDeg)
    const targetPitch =
      t.airspeed < technique.rotateSpeed ? technique.tailUpPitch : technique.climbPitch
    const elevator = Math.max(
      -0.5,
      Math.min(0.5, 0.04 * (targetPitch - t.pitchDeg) - 0.015 * t.pitchRateDeg),
    )
    sim.step(wingsLevel(sim, { throttle: 1, rudder, elevator }))
    if (sim.telemetry().wheelsOnGround.every((w) => !w)) {
      airborneFor += sim.dt
      if (liftoff === undefined) {
        const p = sim.state().position
        liftoff = Math.hypot(p.x - start.x, p.z - start.z)
      }
    } else {
      airborneFor = 0
      liftoff = undefined
    }
  }
  return { liftoff, worstHeadingError, crashed: sim.state().crashed }
}

/** Hands-off glide at idle, wings held level: trim speed and glide ratio. */
export async function glide(aircraft: AircraftSpec, speed: number) {
  const sim = await createSimulation({
    aircraft,
    wind: calm,
    spawn: { kind: 'air', altitude: 120, speed },
  })
  run(sim, 15, (s) => wingsLevel(s))
  const g = average(sim, 8, (s) => wingsLevel(s))
  return { airspeed: g.airspeed, ratio: g.horizontal / -g.climb }
}

/** Level flight on part throttle, altitude held on the elevator. */
export async function cruise(aircraft: AircraftSpec, throttle: number, speed: number) {
  const sim = await createSimulation({
    aircraft,
    wind: calm,
    spawn: { kind: 'air', altitude: 60, speed },
  })
  const pilot = holdAltitude(60, { throttle })
  run(sim, 20, pilot)
  return average(sim, 5, pilot)
}

/**
 * Stall approach as flight-tested: idle, wings level, up-elevator ramped in
 * slowly to full so speed bleeds off ~1 m/s per second. Returns the 1 g
 * stall speed, V * sqrt(1 / n), at the point of maximum lift.
 */
export async function stallSpeed(aircraft: AircraftSpec, flap = 0, speed = 14) {
  const sim = await createSimulation({
    aircraft,
    wind: calm,
    spawn: { kind: 'air', altitude: 150, speed },
  })
  run(sim, 3, (s) => wingsLevel(s, { flap }))
  let slowest = Infinity
  const steps = 15 / sim.dt
  for (let i = 0; i < steps; i++) {
    sim.step(wingsLevel(sim, { flap, elevator: i / steps }))
    const t = sim.telemetry()
    if (t.loadFactor > 0.3) slowest = Math.min(slowest, t.airspeed / Math.sqrt(t.loadFactor))
  }
  return slowest
}

/**
 * Trims hands-off, then kicks it in yaw (full rudder) and in pitch (full up
 * elevator) and lets go: how far each disturbance goes and what is left.
 */
export async function kicks(aircraft: AircraftSpec, speed: number) {
  const sim = await createSimulation({
    aircraft,
    wind: calm,
    spawn: { kind: 'air', altitude: 150, speed },
  })
  run(sim, 12, (s) => wingsLevel(s))
  const trim = sim.telemetry()

  let peakBeta = 0
  run(sim, 0.4, (s) => {
    peakBeta = Math.max(peakBeta, Math.abs(s.telemetry().betaDeg - trim.betaDeg))
    return wingsLevel(s, { rudder: 1 })
  })
  run(sim, 4, (s) => {
    peakBeta = Math.max(peakBeta, Math.abs(s.telemetry().betaDeg - trim.betaDeg))
    return wingsLevel(s)
  })
  const betaAfter = Math.abs(sim.telemetry().betaDeg - trim.betaDeg)

  run(sim, 0.25, (s) => wingsLevel(s, { elevator: 1 }))
  const alphaKick = Math.abs(sim.telemetry().alphaDeg - trim.alphaDeg)
  run(sim, 1, (s) => wingsLevel(s))
  const alphaAfter = Math.abs(sim.telemetry().alphaDeg - trim.alphaDeg)
  return { peakBeta, betaAfter, alphaKick, alphaAfter }
}

/** Peak roll rate on full right aileron from level flight on part throttle. */
export async function peakRollRate(aircraft: AircraftSpec, speed: number, throttle: number) {
  const sim = await createSimulation({
    aircraft,
    wind: calm,
    spawn: { kind: 'air', altitude: 100, speed },
  })
  run(sim, 6, holdAltitude(100, { throttle }))
  let peak = 0
  run(sim, 1.5, (s) => {
    peak = Math.max(peak, s.telemetry().rollRateDeg)
    return { ...idle, throttle, aileron: 1 }
  })
  return peak
}

/**
 * Knife edge to the right, flown the way a pilot holds one: ailerons keep 90
 * deg of bank, top rudder alone holds the height, elevator holds the heading.
 * Once settled, returns the mean controls it took: the aileron and elevator
 * are the roll and pitch coupling of the rudder, and how far the height
 * wanders.
 */
export async function knifeEdge(aircraft: AircraftSpec, speed: number, throttle: number) {
  const sim = await createSimulation({
    aircraft,
    wind: calm,
    spawn: { kind: 'air', altitude: 120, speed },
  })
  run(sim, 4, holdAltitude(120, { throttle }))
  const heading = sim.telemetry().headingDeg
  let integral = 0
  const pilot = (s: Simulation): ControlInputs => {
    const t = s.telemetry()
    const aileron = clamp(0.04 * (90 - t.rollDeg) - 0.01 * t.rollRateDeg)
    const error = 120 - t.altitude
    integral = Math.max(-20, Math.min(20, integral + error * s.dt))
    // Left (negative) rudder yaws the nose up towards the sky; on its side,
    // up elevator turns it right, towards the canopy.
    const rudder = clamp(-(0.15 * error + 0.05 * integral - 0.12 * t.verticalSpeed))
    const elevator = clamp(0.03 * headingError(t.headingDeg, heading) - 0.01 * t.yawRateDeg)
    return { ...idle, throttle, aileron, rudder, elevator }
  }
  run(sim, 3, pilot)
  const n = Math.round(3 / sim.dt)
  const mean = { aileron: 0, elevator: 0, rudder: 0 }
  let low = Infinity
  let high = -Infinity
  for (let i = 0; i < n; i++) {
    const c = pilot(sim)
    sim.step(c)
    mean.aileron += c.aileron / n
    mean.elevator += c.elevator / n
    mean.rudder += c.rudder / n
    const t = sim.telemetry()
    low = Math.min(low, t.altitude)
    high = Math.max(high, t.altitude)
  }
  const end = sim.telemetry()
  return {
    ...mean,
    heightWander: high - low,
    rollDeg: end.rollDeg,
    betaDeg: end.betaDeg,
    airspeed: end.airspeed,
    crashed: sim.state().crashed,
  }
}

/**
 * One axial roll to the right on full aileron alone from level flight at
 * part throttle: how long it takes and how far the nose wanders off the
 * line in heading and pitch (and height) on the way round.
 */
export async function axialRoll(aircraft: AircraftSpec, speed: number, throttle: number) {
  const sim = await createSimulation({
    aircraft,
    wind: calm,
    spawn: { kind: 'air', altitude: 120, speed },
  })
  run(sim, 6, holdAltitude(120, { throttle }))
  const start = sim.telemetry()
  let turned = 0
  let last = start.rollDeg
  let seconds = 0
  let heading = 0
  let pitch = 0
  while (turned < 360 && seconds < 10) {
    sim.step({ ...idle, throttle, aileron: 1 })
    seconds += sim.dt
    const t = sim.telemetry()
    turned += headingError(last, t.rollDeg)
    last = t.rollDeg
    heading = Math.max(heading, Math.abs(headingError(start.headingDeg, t.headingDeg)))
    pitch = Math.max(pitch, Math.abs(t.pitchDeg - start.pitchDeg))
  }
  return { seconds, heading, pitch, heightLost: start.altitude - sim.telemetry().altitude }
}
