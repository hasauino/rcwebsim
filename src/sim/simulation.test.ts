import { describe, expect, it } from 'vitest'
import { pa18 } from './aircraft/pa18'
import { createSimulation, type ControlInputs, type Simulation } from './simulation'

const idle: ControlInputs = { aileron: 0, elevator: 0, rudder: 0, throttle: 0, flap: 0 }
const calm = { speed: 0, fromDeg: 0, turbulence: 0 }

function run(sim: Simulation, seconds: number, inputs: (sim: Simulation) => ControlInputs) {
  const steps = Math.round(seconds / sim.dt)
  for (let i = 0; i < steps; i++) sim.step(inputs(sim))
}

describe('Simulation: on the ground', () => {
  it('settles on its three wheels in a tail-down attitude and stays put', async () => {
    const sim = await createSimulation({ aircraft: pa18, wind: calm })
    run(sim, 1, () => idle)
    const settled = sim.telemetry()
    const start = sim.state().position
    run(sim, 3, () => idle)
    const t = sim.telemetry()
    const end = sim.state().position

    expect(t.wheelsOnGround).toEqual([true, true, true])
    expect(t.pitchDeg).toBeGreaterThan(8)
    expect(t.pitchDeg).toBeLessThan(13)
    expect(Math.abs(t.rollDeg)).toBeLessThan(0.5)
    expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeLessThan(0.02)
    expect(Math.abs(t.pitchDeg - settled.pitchDeg)).toBeLessThan(0.2)
    expect(sim.state().crashed).toBe(false)
  })

  it('makes static thrust typical of a 12x7.5 prop on 4S at full throttle', async () => {
    const sim = await createSimulation({ aircraft: pa18, wind: calm })
    run(sim, 0.6, () => ({ ...idle, throttle: 1 }))
    const t = sim.telemetry()

    // A 12x7.5 on 750Kv and a fully charged 4S (~15.5 V under load) loads to
    // ~85% of no-load rpm; APC-class static CT ~0.11 gives 2.5-3.3 kg.
    expect(t.rpm).toBeGreaterThan(8500)
    expect(t.rpm).toBeLessThan(10500)
    expect(t.thrust).toBeGreaterThan(24)
    expect(t.thrust).toBeLessThan(34)
    expect(t.current).toBeGreaterThan(35)
    expect(t.current).toBeLessThanOrEqual(pa18.esc.currentLimit)
    // Voltage sags under load below the 4S open-circuit voltage.
    expect(t.voltage).toBeLessThan(16.6)
    expect(t.voltage).toBeGreaterThan(14)
  })

  it('freewheels when the throttle is closed', async () => {
    const sim = await createSimulation({ aircraft: pa18, wind: calm })
    run(sim, 0.6, () => ({ ...idle, throttle: 1 }))
    const full = sim.telemetry().rpm
    run(sim, 1, () => idle)
    // No power, so the prop slows to at most windmilling speed (~V / pitch).
    const v = sim.state().velocity
    const windmillRpm = (Math.hypot(v.x, v.y, v.z) / pa18.propeller.pitch) * 60
    expect(sim.telemetry().current).toBe(0)
    expect(sim.telemetry().rpm).toBeLessThan(Math.min(full * 0.3, windmillRpm * 1.2 + 200))
  })
})

/** A minimal test pilot: wings-level and heading hold via ailerons/rudder. */
function wingsLevel(sim: Simulation, extra: Partial<ControlInputs> = {}): ControlInputs {
  const t = sim.telemetry()
  const aileron = Math.max(-1, Math.min(1, -0.04 * t.rollDeg - 0.01 * t.rollRateDeg))
  return { ...idle, aileron, ...extra }
}

/** Test pilot: wings level plus altitude hold on the elevator. */
function holdAltitude(target: number, extra: Partial<ControlInputs> = {}) {
  return (sim: Simulation): ControlInputs => {
    const t = sim.telemetry()
    const elevator = 0.08 * (target - t.altitude) - 0.12 * t.verticalSpeed - 0.01 * t.pitchRateDeg
    return wingsLevel(sim, { elevator: Math.max(-1, Math.min(1, elevator)), ...extra })
  }
}

function average(sim: Simulation, seconds: number, inputs: (sim: Simulation) => ControlInputs) {
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

describe('Simulation: takeoff', () => {
  it('takes off from the runway under full power, tracking straight', async () => {
    const sim = await createSimulation({ aircraft: pa18, wind: calm })
    const start = sim.state().position
    const heading = sim.telemetry().headingDeg
    let liftoff: number | undefined
    let airborneFor = 0
    let worstHeadingError = 0
    for (let i = 0; i < 10 / sim.dt && airborneFor < 1; i++) {
      const t = sim.telemetry()
      const error = ((heading - t.headingDeg + 540) % 360) - 180
      worstHeadingError = Math.max(worstHeadingError, Math.abs(error))
      const rudder = Math.max(-1, Math.min(1, 0.15 * error - 0.03 * t.yawRateDeg))
      // Taildragger technique: tail up for the roll, rotate gently at ~9 m/s.
      const targetPitch = t.airspeed < 9 ? 2 : 10
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
    expect(sim.state().crashed).toBe(false)
    expect(liftoff).toBeDefined()
    // A light-wing-loading Cub at full power: well inside a 120 m club runway.
    expect(liftoff!).toBeLessThan(60)
    expect(worstHeadingError).toBeLessThan(15)
  })
})

describe('Simulation: flight envelope', () => {
  it('trims hands-off into a steady glide at a trainer-like speed and glide ratio', async () => {
    const sim = await createSimulation({
      aircraft: pa18,
      wind: calm,
      spawn: { kind: 'air', altitude: 120, speed: 14 },
    })
    run(sim, 15, (s) => wingsLevel(s))
    const glide = average(sim, 8, (s) => wingsLevel(s))

    expect(glide.airspeed).toBeGreaterThan(9)
    expect(glide.airspeed).toBeLessThan(17)
    const ratio = glide.horizontal / -glide.climb
    expect(ratio).toBeGreaterThan(5)
    expect(ratio).toBeLessThan(11)
  })

  it('cruises level at a trainer cruise speed on part throttle', async () => {
    const sim = await createSimulation({
      aircraft: pa18,
      wind: calm,
      spawn: { kind: 'air', altitude: 60, speed: 16 },
    })
    const pilot = holdAltitude(60, { throttle: 0.6 })
    run(sim, 20, pilot)
    const cruise = average(sim, 5, pilot)

    expect(Math.abs(cruise.climb)).toBeLessThan(1)
    expect(cruise.airspeed).toBeGreaterThan(14)
    expect(cruise.airspeed).toBeLessThan(23)
  })

  /**
   * Stall approach as flight-tested: idle, wings level, up-elevator ramped in
   * slowly to full so speed bleeds off ~1 m/s per second. Returns the 1 g
   * stall speed, V * sqrt(1 / n), at the point of maximum lift.
   */
  async function stallSpeed(flap: number) {
    const sim = await createSimulation({
      aircraft: pa18,
      wind: calm,
      spawn: { kind: 'air', altitude: 150, speed: 14 },
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

  it('stalls near the speed its wing loading predicts, lower with flaps', async () => {
    // W/S = 2.1 kg * g / 0.42 m^2 = 49 N/m^2; CLmax 1.2-1.5 -> 7.3-8.2 m/s.
    const clean = await stallSpeed(0)
    const flaps = await stallSpeed(1)
    expect(clean).toBeGreaterThan(6.5)
    expect(clean).toBeLessThan(10)
    // Plain flaps: ~10-15% lower stall speed.
    expect(flaps).toBeLessThan(clean * 0.95)
  })

  it('rolls at a trainer-like rate on full high-rate aileron', async () => {
    const sim = await createSimulation({
      aircraft: pa18,
      wind: calm,
      spawn: { kind: 'air', altitude: 100, speed: 17 },
    })
    run(sim, 6, holdAltitude(100, { throttle: 0.6 }))
    let peak = 0
    run(sim, 1.5, (s) => {
      peak = Math.max(peak, s.telemetry().rollRateDeg)
      return { ...idle, throttle: 0.6, aileron: 1 }
    })
    // pb/2V ~0.05-0.1 for trainer ailerons at ~17 m/s -> roughly 60-200 deg/s.
    expect(peak).toBeGreaterThan(60)
    expect(peak).toBeLessThan(220)
  })
})

describe('Simulation: crashes', () => {
  it('detects a crash into the ground, cuts the motor, and resets to the runway', async () => {
    const sim = await createSimulation({
      aircraft: pa18,
      wind: calm,
      spawn: { kind: 'air', altitude: 25, speed: 18 },
    })
    run(sim, 6, () => ({ ...idle, throttle: 1, elevator: -1 }))
    expect(sim.state().crashed).toBe(true)
    expect(sim.telemetry().current).toBe(0)

    sim.reset({ kind: 'runway' })
    expect(sim.state().crashed).toBe(false)
    run(sim, 1, () => idle)
    expect(sim.state().crashed).toBe(false)
    expect(sim.telemetry().wheelsOnGround).toEqual([true, true, true])
    expect(sim.telemetry().batteryLevel).toBe(1)
  })

  it('survives a flared touchdown without counting it as a crash', async () => {
    const sim = await createSimulation({
      aircraft: pa18,
      wind: calm,
      spawn: { kind: 'air', altitude: 1.5, speed: 9 },
    })
    run(sim, 4, (s) => wingsLevel(s, { elevator: 0.3 }))
    expect(sim.telemetry().wheelsOnGround.some((w) => w)).toBe(true)
    expect(sim.state().crashed).toBe(false)
  })
})

describe('Simulation: wind and determinism', () => {
  const gusty = { speed: 6, fromDeg: 90, turbulence: 1 }

  async function fly(seed: number, wind = gusty) {
    const sim = await createSimulation({
      aircraft: pa18,
      wind,
      seed,
      spawn: { kind: 'air', altitude: 40, speed: 15 },
    })
    const speeds: number[] = []
    run(sim, 5, (s) => {
      speeds.push(s.telemetry().airspeed)
      return wingsLevel(s, { throttle: 0.6 })
    })
    return { state: sim.state(), speeds }
  }

  it('replays bit-for-bit with the same seed and inputs', async () => {
    const a = await fly(42)
    const b = await fly(42)
    expect(b.state).toEqual(a.state)
  })

  it('makes different gusts with a different seed', async () => {
    const a = await fly(42)
    const b = await fly(43)
    expect(b.state.position).not.toEqual(a.state.position)
  })

  it('produces gusts with the Dryden intensity for the wind strength', async () => {
    const sim = await createSimulation({
      aircraft: pa18,
      wind: gusty,
      seed: 7,
      spawn: { kind: 'air', altitude: 40, speed: 15 },
    })
    let sum = 0
    let n = 0
    run(sim, 40, (s) => {
      const t = s.telemetry()
      sum += t.wind.y ** 2
      n++
      return holdAltitude(40, { throttle: 0.6 })(s)
    })
    // MIL-F-8785C low altitude: sigma_w = 0.1 * W20 = 0.6 m/s for 6 m/s.
    const rms = Math.sqrt(sum / n)
    expect(rms).toBeGreaterThan(0.4)
    expect(rms).toBeLessThan(0.85)
  })

  it('has no gusts when turbulence is off', async () => {
    const sim = await createSimulation({
      aircraft: pa18,
      wind: { ...gusty, turbulence: 0 },
      spawn: { kind: 'air', altitude: 40, speed: 15 },
    })
    run(sim, 1, (s) => wingsLevel(s, { throttle: 0.6 }))
    expect(sim.telemetry().wind).toEqual({ x: -6, y: 0, z: expect.closeTo(0, 9) })
  })
})
