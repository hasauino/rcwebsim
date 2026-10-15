import { describe, expect, it } from 'vitest'
import { FIELD, terrainHeight } from '../sim/field'
import { Pilot } from './pilot'

const NORTH = { x: 0, z: -1 }
const ahead = { forward: 1, right: 0, running: false }

/** Walks for `seconds` in 60 Hz frames. */
function walkFor(pilot: Pilot, seconds: number, keys = ahead, facing = NORTH) {
  for (let i = 0; i < seconds * 60; i++) pilot.walk(1 / 60, keys, facing)
}

describe('pilot', () => {
  it('starts at the pilot station', () => {
    const pilot = new Pilot([])
    expect(pilot.eye).toEqual(FIELD.pilotStation)
  })

  it('walks ahead the way they face at a walking pace', () => {
    const pilot = new Pilot([])
    walkFor(pilot, 10)
    // About 1.4 m/s: 14 m north of the station at z = 16.
    expect(pilot.eye.z).toBeCloseTo(2, 1)
    expect(pilot.eye.x).toBeCloseTo(0)
  })

  it('sidesteps to their right', () => {
    const pilot = new Pilot([])
    walkFor(pilot, 10, { forward: 0, right: 1, running: false })
    // Facing north, right is east.
    expect(pilot.eye.x).toBeCloseTo(14, 1)
    expect(pilot.eye.z).toBeCloseTo(16)
  })

  it('walks no faster on a diagonal', () => {
    const pilot = new Pilot([])
    walkFor(pilot, 10, { forward: 1, right: 1, running: false })
    const moved = Math.hypot(pilot.eye.x, pilot.eye.z - 16)
    expect(moved).toBeCloseTo(14, 1)
  })

  it('runs at about 4 m/s', () => {
    const pilot = new Pilot([])
    walkFor(pilot, 10, { forward: 1, right: 0, running: true })
    expect(pilot.eye.z).toBeCloseTo(-24, 1)
  })

  it('stands on the hills at eye height', () => {
    const pilot = new Pilot([])
    walkFor(pilot, 200, { forward: 0, right: 1, running: true })
    // 800 m east, past the hill ramp.
    expect(pilot.eye.x).toBeCloseTo(800, 0)
    expect(pilot.eye.y).toBeGreaterThan(6)
    expect(pilot.eye.y - terrainHeight(pilot.eye.x, pilot.eye.z)).toBeCloseTo(1.7)
  })

  it('stays on the field', () => {
    const pilot = new Pilot([])
    walkFor(pilot, 400, { forward: -1, right: 0, running: true })
    expect(pilot.eye.z).toBeLessThan(FIELD.size / 2)
  })

  it('does not walk through a tree trunk', () => {
    const tree = { x: 0, z: 10, height: 12, trunkRadius: 0.3, canopyRadius: 3 }
    const pilot = new Pilot([tree])
    walkFor(pilot, 10)
    expect(pilot.eye.z).toBeGreaterThan(10.3)
  })

  it('slips round a trunk it meets off-centre', () => {
    const tree = { x: 0.2, z: 10, height: 12, trunkRadius: 0.3, canopyRadius: 3 }
    const pilot = new Pilot([tree])
    walkFor(pilot, 10)
    expect(pilot.eye.z).toBeLessThan(5)
  })

  it('keeps their heading while looking straight up', () => {
    const pilot = new Pilot([])
    walkFor(pilot, 5)
    walkFor(pilot, 5, ahead, { x: 0, z: 0 })
    expect(pilot.eye.z).toBeCloseTo(2, 1)
    expect(pilot.eye.x).toBeCloseTo(0)
  })

  it('goes back to the pilot station', () => {
    const pilot = new Pilot([])
    walkFor(pilot, 200, { forward: 1, right: 1, running: true })
    pilot.returnToStation()
    expect(pilot.eye).toEqual(FIELD.pilotStation)
  })
})
