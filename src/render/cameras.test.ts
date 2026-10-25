import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import { CameraRig } from './cameras'

const level = new Quaternion()

/** A pilot view rig, settled on an aircraft this far out and up from the eye. */
function settled(out: number, up: number, options: Partial<CameraRig> = {}): CameraRig {
  const rig = Object.assign(new CameraRig(16 / 9), options)
  const plane = aircraftAt(rig, out, up)
  for (let i = 0; i < 600; i++) rig.update(1 / 60, plane, level)
  rig.camera.updateMatrixWorld()
  return rig
}

/** Due north of the pilot, across the runway, `out` m away and `up` m above the eye. */
function aircraftAt(rig: CameraRig, out: number, up: number): Vector3 {
  return new Vector3(rig.eye.x, rig.eye.y + up, rig.eye.z - out)
}

/** Where a world point lands on screen, -1..1 each way when in view. */
function onScreen(rig: CameraRig, point: Vector3): Vector3 {
  return point.clone().project(rig.camera)
}

/** The ground a long way beyond the aircraft, just under the horizon. */
function farGround(rig: CameraRig): Vector3 {
  return new Vector3(rig.eye.x, 0, rig.eye.z - 2000)
}

describe('pilot view', () => {
  it('keeps the ground in view under a high aircraft', () => {
    const rig = settled(100, 30, { keepGroundInView: true })
    expect(onScreen(rig, farGround(rig)).y).toBeGreaterThan(-1)
    const aircraft = onScreen(rig, aircraftAt(rig, 100, 30)).y
    expect(aircraft).toBeGreaterThan(0.3)
    expect(aircraft).toBeLessThan(1)
  })

  it('loses the ground there without it, centred on the aircraft', () => {
    const rig = settled(100, 30, { keepGroundInView: false })
    expect(onScreen(rig, farGround(rig)).y).toBeLessThan(-1)
    expect(onScreen(rig, aircraftAt(rig, 100, 30)).y).toBeCloseTo(0, 2)
  })

  it('zooms as tight as ever on a low pass', () => {
    // Auto-zoom wants ~28.6° here; the ground alone would allow ~9°.
    const kept = settled(20, 1, { keepGroundInView: true })
    const free = settled(20, 1, { keepGroundInView: false })
    expect(kept.camera.fov).toBeCloseTo(28.6, 0)
    expect(kept.camera.fov).toBeCloseTo(free.camera.fov, 1)
    expect(onScreen(kept, farGround(kept)).y).toBeGreaterThan(-1)
  })

  it('keeps an aircraft too high for the ground on screen, zoomed out no wider than the field of view', () => {
    const rig = settled(40, 60, { keepGroundInView: true, baseFov: 50 })
    expect(rig.camera.fov).toBeCloseTo(50, 1)
    expect(Math.abs(onScreen(rig, aircraftAt(rig, 40, 60)).y)).toBeLessThan(1)
  })

  it('looks down for the ground with auto-zoom off too', () => {
    const rig = settled(100, 30, { keepGroundInView: true, autoZoom: false, baseFov: 50 })
    expect(rig.camera.fov).toBeCloseTo(50, 1)
    expect(onScreen(rig, farGround(rig)).y).toBeGreaterThan(-1)
  })
})
