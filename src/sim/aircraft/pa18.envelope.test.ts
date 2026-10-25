import { describe, expect, it } from 'vitest'
import {
  cruise,
  freewheel,
  glide,
  kicks,
  peakRollRate,
  settle,
  stallSpeed,
  staticRun,
  takeoff,
} from '../test-pilots'
import { pa18 } from './pa18'

describe('PA-18: on the ground', () => {
  it('settles on its three wheels in a tail-down attitude and stays put', async () => {
    const s = await settle(pa18)
    expect(s.telemetry.wheelsOnGround).toEqual([true, true, true])
    expect(s.telemetry.pitchDeg).toBeGreaterThan(8)
    expect(s.telemetry.pitchDeg).toBeLessThan(13)
    expect(Math.abs(s.telemetry.rollDeg)).toBeLessThan(0.5)
    expect(s.drift).toBeLessThan(0.02)
    expect(s.pitchChange).toBeLessThan(0.2)
    expect(s.crashed).toBe(false)
  })

  it('makes static thrust typical of a 12x7.5 prop on 4S at full throttle', async () => {
    const t = await staticRun(pa18)
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
    const f = await freewheel(pa18)
    expect(f.current).toBe(0)
    expect(f.rpm).toBeLessThan(Math.min(f.fullRpm * 0.3, f.windmillRpm * 1.2 + 200))
  })
})

describe('PA-18: takeoff', () => {
  it('takes off from the runway under full power, tracking straight', async () => {
    // Taildragger technique: tail up for the roll, rotate gently at ~9 m/s.
    const t = await takeoff(pa18, { tailUpPitch: 2, rotateSpeed: 9, climbPitch: 10 })
    expect(t.crashed).toBe(false)
    expect(t.liftoff).toBeDefined()
    // A light-wing-loading Cub at full power: well inside a 120 m club runway.
    expect(t.liftoff!).toBeLessThan(60)
    expect(t.worstHeadingError).toBeLessThan(15)
  })
})

describe('PA-18: flight envelope', () => {
  it('trims hands-off into a steady glide at a trainer-like speed and glide ratio', async () => {
    const g = await glide(pa18, 14)
    expect(g.airspeed).toBeGreaterThan(9)
    expect(g.airspeed).toBeLessThan(17)
    expect(g.ratio).toBeGreaterThan(5)
    expect(g.ratio).toBeLessThan(11)
  })

  it('cruises level at a trainer cruise speed on part throttle', async () => {
    const c = await cruise(pa18, 0.6, 16)
    expect(Math.abs(c.climb)).toBeLessThan(1)
    expect(c.airspeed).toBeGreaterThan(14)
    expect(c.airspeed).toBeLessThan(23)
  })

  it('stalls near the speed its wing loading predicts, lower with flaps', async () => {
    // W/S = 2.1 kg * g / 0.42 m^2 = 49 N/m^2; CLmax 1.2-1.5 -> 7.3-8.2 m/s.
    const clean = await stallSpeed(pa18, 0)
    const flaps = await stallSpeed(pa18, 1)
    expect(clean).toBeGreaterThan(6.5)
    expect(clean).toBeLessThan(10)
    // Plain flaps: ~10-15% lower stall speed.
    expect(flaps).toBeLessThan(clean * 0.95)
  })

  it('is statically and dynamically stable in pitch and yaw', async () => {
    const k = await kicks(pa18, 13)
    // Kicked in yaw, sideslip builds, then weathervanes back (Cn_beta > 0).
    expect(k.peakBeta).toBeGreaterThan(4)
    expect(k.betaAfter).toBeLessThan(1)
    // Kicked in pitch, the short-period mode (alpha) damps within a second
    // (Cm_alpha < 0, Cm_q < 0). The slower phugoid it excites is left alone.
    expect(k.alphaKick).toBeGreaterThan(3)
    expect(k.alphaAfter).toBeLessThan(1.5)
  })

  it('rolls at a trainer-like rate on full high-rate aileron', async () => {
    const peak = await peakRollRate(pa18, 17, 0.6)
    // pb/2V ~0.05-0.1 for trainer ailerons at ~17 m/s -> roughly 60-200 deg/s.
    expect(peak).toBeGreaterThan(60)
    expect(peak).toBeLessThan(220)
  })
})
