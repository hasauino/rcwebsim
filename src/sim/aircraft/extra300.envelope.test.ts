import { describe, expect, it } from 'vitest'
import {
  axialRoll,
  cruise,
  freewheel,
  glide,
  kicks,
  knifeEdge,
  peakRollRate,
  settle,
  stallSpeed,
  staticRun,
  takeoff,
} from '../test-pilots'
import { extra300 } from './extra300'

describe('Extra 300: on the ground', () => {
  it('settles on its three wheels in a tail-down attitude and stays put', async () => {
    const s = await settle(extra300)
    expect(s.telemetry.wheelsOnGround).toEqual([true, true, true])
    // The model sits at 8.4 deg on its wheels.
    expect(s.telemetry.pitchDeg).toBeGreaterThan(7)
    expect(s.telemetry.pitchDeg).toBeLessThan(10)
    expect(Math.abs(s.telemetry.rollDeg)).toBeLessThan(0.5)
    expect(s.drift).toBeLessThan(0.02)
    expect(s.pitchChange).toBeLessThan(0.2)
    expect(s.crashed).toBe(false)
  })

  it('pulls more than its weight at full throttle, as its vertical performance needs', async () => {
    const t = await staticRun(extra300)
    // A 13x6 on 910Kv and 4S (~14.5 V under load) is a heavy load for the
    // motor and pulls it down to 60-80% of no-load rpm; static CT ~0.09-0.11
    // then gives 2.0-3.5 kg.
    expect(t.rpm).toBeGreaterThan(7500)
    expect(t.rpm).toBeLessThan(10500)
    expect(t.thrust).toBeGreaterThan(20)
    expect(t.thrust).toBeLessThan(34)
    expect(t.current).toBeLessThanOrEqual(extra300.esc.currentLimit)
    // Horizon: "outstanding thrust and vertical performance". It hangs on the prop.
    expect(t.thrust).toBeGreaterThan(1.2 * extra300.mass * 9.81)
  })

  it('freewheels when the throttle is closed', async () => {
    const f = await freewheel(extra300)
    expect(f.current).toBe(0)
    // The wooden 13x6 has about twice the PA-18 prop's inertia, so a second
    // after the cut it has only spun down to half speed; it must still be
    // down at windmilling speed or below.
    expect(f.rpm).toBeLessThan(Math.min(f.fullRpm * 0.5, f.windmillRpm * 1.2 + 200))
  })
})

describe('Extra 300: takeoff', () => {
  it('takes off from the runway under full power in a few metres, tracking straight', async () => {
    const t = await takeoff(extra300, { tailUpPitch: 2, rotateSpeed: 11, climbPitch: 10 })
    expect(t.crashed).toBe(false)
    expect(t.liftoff).toBeDefined()
    // Thrust/weight ~1.6: it accelerates at ~1 g to a ~10 m/s liftoff.
    expect(t.liftoff!).toBeLessThan(25)
    expect(t.worstHeadingError).toBeLessThan(15)
  })
})

describe('Extra 300: flight envelope', () => {
  it('glides hands-off steeply, as a draggy symmetric-wing aerobat does', async () => {
    const g = await glide(extra300, 16)
    expect(g.airspeed).toBeGreaterThan(11)
    expect(g.airspeed).toBeLessThan(17)
    // L/D = CL / (CD0 + CL^2 / (pi AR e)): AR 4.6, trim CL ~0.36, and CD0
    // 0.04-0.09 for an aerobatic model with a stopped prop -> 3.5-7.5.
    expect(g.ratio).toBeGreaterThan(3.5)
    expect(g.ratio).toBeLessThan(7.5)
  })

  it('cruises level on half throttle', async () => {
    const c = await cruise(extra300, 0.5, 18)
    expect(Math.abs(c.climb)).toBeLessThan(1)
    // Level speed where drag power q*S*CD0*V matches half throttle's ~100 W
    // of thrust power: CD0 0.04-0.09 gives 17-22 m/s, 2-3x its stall speed.
    // The band allows for the throttle-to-power curve.
    expect(c.airspeed).toBeGreaterThan(15)
    expect(c.airspeed).toBeLessThan(24)
  })

  it('stalls near the speed its wing loading predicts', async () => {
    // W/S = 1.51 kg * g / 0.369 m^2 = 40 N/m^2. NACA 0012 at Re 150-250k
    // reaches cl 1.0-1.1 (XFoil), the finite wing CLmax 0.85-1.1 -> 7.7-8.8 m/s.
    const v = await stallSpeed(extra300, 0, 15)
    expect(v).toBeGreaterThan(7.2)
    expect(v).toBeLessThan(9.5)
  })

  it('is statically and dynamically stable in pitch and yaw', async () => {
    const k = await kicks(extra300, 15)
    expect(k.peakBeta).toBeGreaterThan(4)
    expect(k.betaAfter).toBeLessThan(1)
    // Full up elevator is 41 deg of throw, a far bigger kick than the Cub's,
    // so the short period is judged by what is left of it after a second.
    expect(k.alphaKick).toBeGreaterThan(3)
    expect(k.alphaAfter).toBeLessThan(0.15 * k.alphaKick)
  })

  it('rolls as fast as the real one on full high-rate aileron at full power', async () => {
    const peak = await peakRollRate(extra300, 30, 1)
    // Timed frame by frame from flight video of this model (60 fps, +/-1
    // frame): level rolls at 705-830 deg/s, every roll 690-900 deg/s, at
    // speeds no faster than level flight at full power.
    // TheRcSaylors, youtube.com/watch?v=i5NVfUVCtDY 1:14.8-1:23.3 (744, ~800, ~705);
    // Two Brothers RC, youtube.com/watch?v=9BfnySWtPXo 2:05.6, 2:22.1 (~690, ~765);
    // Desert Fox, youtube.com/watch?v=Pcz6FlXHIAY 2:46.9 (~900).
    expect(peak).toBeGreaterThan(690)
    expect(peak).toBeLessThan(900)
  })

  it('rolls axially: the nose stays on its line through a full roll', async () => {
    const r = await axialRoll(extra300, 20, 0.6)
    // No dihedral, so no yaw-roll coupling to barrel the roll out (the PA-18
    // ends ~35 deg off heading and ~20 m down). On video it flies three
    // back-to-back level axial rolls on the aileron (TheRcSaylors,
    // youtube.com/watch?v=i5NVfUVCtDY 1:14.8).
    expect(r.seconds).toBeLessThan(1.5)
    expect(r.heading).toBeLessThan(15)
    expect(r.heightLost).toBeLessThan(6)
  })

  it('holds a knife edge on rudder alone, with almost no roll or pitch coupling', async () => {
    const k = await knifeEdge(extra300, 22, 0.8)
    expect(k.crashed).toBe(false)
    // Within its rudder throw, holding height.
    expect(Math.abs(k.rudder)).toBeLessThan(0.9)
    expect(k.heightWander).toBeLessThan(3)
    expect(Math.abs(k.rollDeg - 90)).toBeLessThan(5)
    // Its pilots fly knife edge with no mix: "almost knife edging without me
    // doing anything", no drift towards canopy or belly in a 5 s hold
    // (TheRcSaylors, youtube.com/watch?v=i5NVfUVCtDY 2:27); "just some rudder
    // and a little bit of aileron to compensate" (Two Brothers RC,
    // youtube.com/watch?v=9BfnySWtPXo 3:18). So a few percent of stick at most.
    expect(Math.abs(k.aileron)).toBeLessThan(0.05)
    expect(Math.abs(k.elevator)).toBeLessThan(0.15)
  })
})
