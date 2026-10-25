import { describe, expect, it } from 'vitest'
import { pa18 } from './aircraft/pa18'
import { balance, neutralPoint } from './balance'
import { FIELD } from './field'
import {
  PERFECT_BUILD,
  buildTolerances,
  createSimulation,
  type BuildTolerances,
} from './simulation'
import { average, calm, holdAltitude, idle, run, wingsLevel } from './test-pilots'

describe('Simulation: parked on the runway', () => {
  /** How far it rolls along the runway, parked at idle in this wind for 10 s. */
  async function parked(wind: { speed: number; fromDeg: number; turbulence: number }) {
    const sim = await createSimulation({ aircraft: pa18, wind, seed: 1 })
    const start = sim.state().position
    run(sim, 10, () => idle)
    const end = sim.state().position
    return Math.hypot(end.x - start.x, end.z - start.z)
  }

  it('stays put in a gusty breeze: the wheels hold until a push beats their rolling resistance', async () => {
    // 3 m/s gusting pushes the airframe back with up to ~0.75 N; on mown grass
    // a tyre at rest needs rollingResistance x weight (~1.0 N) to start rolling.
    expect(await parked({ speed: 3, fromDeg: 90, turbulence: 1 })).toBeLessThan(0.02)
  })

  it('is blown back by a wind that beats the rolling resistance', async () => {
    // At 8 m/s the wing lifts most of the weight off the wheels and the
    // airframe drag is several times what they can hold.
    expect(await parked({ speed: 8, fromDeg: 90, turbulence: 0 })).toBeGreaterThan(0.5)
  })
})

describe('Simulation: hand launch', () => {
  it('leaves the pilot’s hand above head height, wings level, at the throw speed', async () => {
    const sim = await createSimulation({ aircraft: pa18, wind: calm, spawn: { kind: 'hand' } })
    const t = sim.telemetry()
    const p = sim.state().position

    // Thrown from beside the pilot station, down the runway heading.
    expect(Math.hypot(p.x - FIELD.pilotStation.x, p.z - FIELD.pilotStation.z)).toBeLessThan(2)
    expect(t.altitude).toBeGreaterThan(1.5)
    expect(t.altitude).toBeLessThan(2.5)
    expect(t.headingDeg).toBeCloseTo(FIELD.runwayStart.headingDeg, 0)
    expect(Math.abs(t.rollDeg)).toBeLessThan(0.5)
    expect(t.pitchDeg).toBeGreaterThan(0)
    expect(t.pitchDeg).toBeLessThan(15)
    expect(t.airspeed).toBeGreaterThan(8)
    expect(t.wheelsOnGround).toEqual([false, false, false])

    sim.reset({ kind: 'hand', speed: 4, from: { x: 30, z: -5 } })
    const weak = sim.state().position
    expect(sim.telemetry().airspeed).toBeCloseTo(4, 1)
    expect(Math.hypot(weak.x - 30, weak.z + 5)).toBeLessThan(2)
  })

  it('climbs away hands off from a firm throw at full power', async () => {
    const sim = await createSimulation({ aircraft: pa18, wind: calm, spawn: { kind: 'hand' } })
    let lowest = Infinity
    run(sim, 4, (s) => {
      lowest = Math.min(lowest, s.telemetry().altitude)
      return { ...idle, throttle: 1 }
    })
    expect(sim.state().crashed).toBe(false)
    expect(lowest).toBeGreaterThan(1)
    expect(sim.telemetry().altitude).toBeGreaterThan(15)
  })

  it('sinks into the ground from a weak throw unless the pilot holds the nose up', async () => {
    const sim = await createSimulation({
      aircraft: pa18,
      wind: calm,
      spawn: { kind: 'hand', speed: 6 },
    })
    // Hands off, it noses down for flying speed it has no height to find.
    run(sim, 2, () => ({ ...idle, throttle: 1 }))
    expect(sim.state().crashed).toBe(true)

    // Held at a gentle climb attitude, wings level, the motor drags it clear.
    sim.reset({ kind: 'hand', speed: 6 })
    let lowest = Infinity
    run(sim, 5, (s) => {
      const t = s.telemetry()
      lowest = Math.min(lowest, t.altitude)
      const elevator = Math.max(-1, Math.min(1, 0.04 * (8 - t.pitchDeg) - 0.015 * t.pitchRateDeg))
      return wingsLevel(s, { throttle: 1, elevator })
    })
    expect(sim.state().crashed).toBe(false)
    expect(lowest).toBeLessThan(1.8)
    expect(sim.telemetry().altitude).toBeGreaterThan(10)
  })
})

describe('Simulation: balance', () => {
  async function glideSpeed(cg: number) {
    const sim = await createSimulation({
      aircraft: pa18,
      wind: calm,
      cg,
      spawn: { kind: 'air', altitude: 150, speed: 13 },
    })
    run(sim, 15, (s) => wingsLevel(s))
    return average(sim, 8, (s) => wingsLevel(s)).airspeed
  }

  it('trims to a faster glide when nose heavy and a slower one when tail heavy', async () => {
    const manual = await glideSpeed(pa18.centerOfGravity[2])
    // Stick-fixed trim: moving the CG forward needs more tail download, so
    // with the elevator fixed the plane trims at a lower lift coefficient,
    // i.e. faster. A direction check; 0.3 m/s is just clear of settling noise.
    expect(await glideSpeed(0.06)).toBeGreaterThan(manual + 0.3)
    expect(await glideSpeed(0.1)).toBeLessThan(manual - 0.3)
  })

  /** Angle of attack range over the last seconds of a long fixed-elevator glide. */
  async function fixedStickAlpha(cg: number, elevator: number) {
    const sim = await createSimulation({
      aircraft: pa18,
      wind: calm,
      cg,
      spawn: { kind: 'air', altitude: 250, speed: 12 },
    })
    run(sim, 16, (s) => wingsLevel(s, { elevator }))
    let low = Infinity
    let high = -Infinity
    run(sim, 4, (s) => {
      low = Math.min(low, s.telemetry().alphaDeg)
      high = Math.max(high, s.telemetry().alphaDeg)
      return wingsLevel(s, { elevator })
    })
    return { low, high, mean: (low + high) / 2 }
  }

  it('gets more sensitive to elevator as the CG moves back', async () => {
    // Measured with down elevator, clear of the stall where lift stops growing.
    const swing = async (cg: number) =>
      (await fixedStickAlpha(cg, 0)).mean - (await fixedStickAlpha(cg, -0.15)).mean
    const manual = await swing(pa18.centerOfGravity[2])
    const tail = await swing(0.1)
    expect(manual).toBeGreaterThan(1)
    // Stick-fixed theory: trim alpha per unit elevator goes as 1 / static
    // margin, so the swing should grow by the ratio of the two margins
    // (about 2.4x here). Allow for the lift curve's nonlinearity.
    const predicted =
      balance(pa18, pa18.centerOfGravity[2]).staticMargin / balance(pa18, 0.1).staticMargin
    expect(tail / manual).toBeGreaterThan(predicted * 0.75)
    expect(tail / manual).toBeLessThan(predicted * 1.5)
  })

  it('holds no steady flying attitude with the CG behind the neutral point', async () => {
    const np = neutralPoint(pa18)
    // Steady (under 1 deg of wander) at a flying angle of attack: above the
    // zero-lift dive, below the ~14 deg section stall.
    const steadyFlying = (alpha: { low: number; high: number; mean: number }) =>
      alpha.high - alpha.low < 1 && alpha.mean > 2 && alpha.mean < 12
    // Ahead of it, a fixed elevator settles to a steady angle of attack.
    expect(steadyFlying(await fixedStickAlpha(np - 0.02, 0))).toBe(true)
    // Behind it, every elevator setting either wallows, dives, or locks up
    // near the stall: none trims to a normal flying angle of attack.
    for (const elevator of [0.2, 0, -0.2, -0.4, -0.6]) {
      const alpha = await fixedStickAlpha(np + 0.02, elevator)
      expect(steadyFlying(alpha), `elevator ${elevator}: ${alpha.low}..${alpha.high} deg`).toBe(
        false,
      )
    }
  })

  it('moves the CG when told to and keeps it through a reset', async () => {
    const sim = await createSimulation({ aircraft: pa18, wind: calm })
    expect(sim.centerOfGravity()).toEqual({ x: 0, y: -0.09, z: 0.082 })
    sim.setCg(0.07)
    sim.reset({ kind: 'runway' })
    expect(sim.centerOfGravity().z).toBe(0.07)
  })
})

describe('Simulation: build tolerances', () => {
  /** Telemetry after flying hands-off at part throttle from an air start. */
  async function handsOff(build: BuildTolerances, seconds: number) {
    const sim = await createSimulation({
      aircraft: pa18,
      wind: calm,
      spawn: { kind: 'air', altitude: 80, speed: 15 },
      buildTolerances: build,
    })
    run(sim, seconds, () => ({ ...idle, throttle: 0.5 }))
    return sim.telemetry()
  }

  it('flies off true when a control linkage is set off neutral, the way the stick would move it', async () => {
    const offset = async (build: Partial<BuildTolerances>, seconds: number) => {
      const straight = await handsOff(PERFECT_BUILD, seconds)
      const off = await handsOff({ ...PERFECT_BUILD, ...build }, seconds)
      return {
        roll: off.rollDeg - straight.rollDeg,
        pitch: off.pitchDeg - straight.pitchDeg,
        turn: ((off.headingDeg - straight.headingDeg + 540) % 360) - 180,
      }
    }
    // Half a degree of aileron is a few trim clicks, yet rolls the plane on in seconds.
    expect((await offset({ aileronDeg: 0.5 }, 3)).roll).toBeGreaterThan(5)
    expect((await offset({ elevatorDeg: 0.75 }, 2)).pitch).toBeGreaterThan(2)
    expect((await offset({ rudderDeg: 1 }, 5)).turn).toBeGreaterThan(3)
  })

  it('needs a few clicks of trim at most, so the plane stays flyable', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const build = buildTolerances(pa18, seed)
      expect(Math.abs(build.aileronDeg)).toBeLessThanOrEqual(pa18.buildTolerance.aileronDeg)
      expect(Math.abs(build.elevatorDeg)).toBeLessThanOrEqual(pa18.buildTolerance.elevatorDeg)
      expect(Math.abs(build.rudderDeg)).toBeLessThanOrEqual(pa18.buildTolerance.rudderDeg)
    }
    expect(buildTolerances(pa18, 7)).toEqual(buildTolerances(pa18, 7))
    expect(buildTolerances(pa18, 7)).not.toEqual(buildTolerances(pa18, 8))
  })

  it('keeps the airframe through a reset, and flies perfect by default', async () => {
    const sim = await createSimulation({ aircraft: pa18, wind: calm })
    expect(sim.buildTolerances()).toEqual(PERFECT_BUILD)
    const build = buildTolerances(pa18, 3)
    sim.setBuildTolerances(build)
    sim.reset({ kind: 'runway' })
    expect(sim.buildTolerances()).toEqual(build)
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
    // Idle, holding a flare attitude: the plane sinks onto its wheels.
    let touched = false
    run(sim, 6, (s) => {
      const t = s.telemetry()
      touched ||= t.wheelsOnGround.some((w) => w)
      const elevator = Math.max(-1, Math.min(1, 0.04 * (6 - t.pitchDeg) - 0.015 * t.pitchRateDeg))
      return wingsLevel(s, { elevator })
    })
    expect(touched).toBe(true)
    expect(sim.telemetry().altitude).toBeLessThan(0.4)
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
