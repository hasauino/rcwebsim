import { describe, expect, it } from 'vitest'
import { pa18 } from './aircraft/pa18'
import { buildTolerances, createSimulation } from './simulation'
import { FlightRecorder, replay } from './recording'

describe('flight recording', () => {
  it('replays a recorded flight to the identical end state', async () => {
    const options = {
      aircraft: pa18,
      seed: 99,
      wind: { speed: 5, fromDeg: 120, turbulence: 1 },
      spawn: { kind: 'runway' as const },
    }
    const sim = await createSimulation(options)
    const recorder = new FlightRecorder(options)
    for (let i = 0; i < 4 / sim.dt; i++) {
      const t = i * sim.dt
      const inputs = {
        throttle: Math.min(1, t / 2),
        aileron: 0.3 * Math.sin(t * 2),
        elevator: t > 2.5 ? 0.3 : 0,
        rudder: 0.2 * Math.sin(t * 3),
        flap: t > 1 ? 0.5 : 0,
      }
      recorder.record(inputs)
      sim.step(inputs)
    }

    // Recordings are plain data: they survive a JSON round trip.
    const recording = JSON.parse(JSON.stringify(recorder.finish()))
    const fresh = await createSimulation({ aircraft: pa18 })
    replay(fresh, recording)

    expect(fresh.state()).toEqual(sim.state())
  })

  it('replays a hand launch from where the pilot stood, at its launch speed', async () => {
    const options = {
      aircraft: pa18,
      seed: 7,
      spawn: { kind: 'hand' as const, speed: 5, from: { x: -20, z: 3 } },
    }
    const sim = await createSimulation(options)
    const recorder = new FlightRecorder(options)
    const inputs = { throttle: 1, aileron: 0, elevator: 0.2, rudder: 0, flap: 0 }
    for (let i = 0; i < 1000; i++) {
      recorder.record(inputs)
      sim.step(inputs)
    }

    const fresh = await createSimulation({ aircraft: pa18 })
    replay(fresh, JSON.parse(JSON.stringify(recorder.finish())))
    expect(fresh.state()).toEqual(sim.state())
  })

  it('replays wind changes made during the flight', async () => {
    const options = {
      aircraft: pa18,
      seed: 5,
      wind: { speed: 2, fromDeg: 90, turbulence: 0.5 },
      spawn: { kind: 'air' as const },
    }
    const sim = await createSimulation(options)
    const recorder = new FlightRecorder(options)
    const inputs = { throttle: 0.6, aileron: 0, elevator: 0, rudder: 0, flap: 0 }
    for (let i = 0; i < 1000; i++) {
      if (i === 400) {
        const gust = { speed: 8, fromDeg: 200, turbulence: 1.5 }
        sim.setWind(gust)
        recorder.setWind(gust)
      }
      recorder.record(inputs)
      sim.step(inputs)
    }

    const fresh = await createSimulation({ aircraft: pa18 })
    replay(fresh, JSON.parse(JSON.stringify(recorder.finish())))
    expect(fresh.state()).toEqual(sim.state())
  })

  it('replays a moved CG, including a change made during the flight', async () => {
    const options = {
      aircraft: pa18,
      seed: 3,
      cg: 0.07,
      wind: { speed: 2, fromDeg: 90, turbulence: 0.5 },
      spawn: { kind: 'air' as const },
    }
    const sim = await createSimulation(options)
    const recorder = new FlightRecorder(options)
    const inputs = { throttle: 0.6, aileron: 0, elevator: 0, rudder: 0, flap: 0 }
    for (let i = 0; i < 1000; i++) {
      if (i === 400) {
        sim.setCg(0.095)
        recorder.setCg(0.095)
      }
      recorder.record(inputs)
      sim.step(inputs)
    }

    const fresh = await createSimulation({ aircraft: pa18 })
    replay(fresh, JSON.parse(JSON.stringify(recorder.finish())))
    expect(fresh.state()).toEqual(sim.state())
    expect(fresh.centerOfGravity().z).toBe(0.095)
  })

  it('replays an airframe built off true, including a new one rigged during the flight', async () => {
    const options = {
      aircraft: pa18,
      seed: 6,
      buildTolerances: buildTolerances(pa18, 11),
      spawn: { kind: 'air' as const },
    }
    const sim = await createSimulation(options)
    const recorder = new FlightRecorder(options)
    const inputs = { throttle: 0.6, aileron: 0, elevator: 0, rudder: 0, flap: 0 }
    for (let i = 0; i < 1000; i++) {
      if (i === 400) {
        sim.setBuildTolerances(buildTolerances(pa18, 12))
        recorder.setBuildTolerances(buildTolerances(pa18, 12))
      }
      recorder.record(inputs)
      sim.step(inputs)
    }

    const fresh = await createSimulation({
      aircraft: pa18,
      buildTolerances: buildTolerances(pa18, 1),
    })
    replay(fresh, JSON.parse(JSON.stringify(recorder.finish())))
    expect(fresh.state()).toEqual(sim.state())
    expect(fresh.buildTolerances()).toEqual(buildTolerances(pa18, 12))
  })

  it("replays a recording made at the aircraft's own CG on a sim whose CG was moved", async () => {
    const options = { aircraft: pa18, seed: 4, spawn: { kind: 'air' as const } }
    const sim = await createSimulation(options)
    const recorder = new FlightRecorder(options)
    const inputs = { throttle: 0.6, aileron: 0, elevator: 0, rudder: 0, flap: 0 }
    for (let i = 0; i < 500; i++) {
      recorder.record(inputs)
      sim.step(inputs)
    }

    const fresh = await createSimulation({ aircraft: pa18, cg: 0.1 })
    replay(fresh, recorder.finish())
    expect(fresh.state()).toEqual(sim.state())
  })

  it('stores held inputs compactly', () => {
    const recorder = new FlightRecorder({ aircraft: pa18, seed: 1 })
    const held = { throttle: 0.5, aileron: 0, elevator: 0, rudder: 0, flap: 0 }
    for (let i = 0; i < 1000; i++) recorder.record(held)
    expect(recorder.finish().frames).toHaveLength(1)
  })
})
