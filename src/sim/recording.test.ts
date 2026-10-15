import { describe, expect, it } from 'vitest'
import { pa18 } from './aircraft/pa18'
import { createSimulation } from './simulation'
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

  it('stores held inputs compactly', () => {
    const recorder = new FlightRecorder({ aircraft: pa18, seed: 1 })
    const held = { throttle: 0.5, aileron: 0, elevator: 0, rudder: 0, flap: 0 }
    for (let i = 0; i < 1000; i++) recorder.record(held)
    expect(recorder.finish().frames).toHaveLength(1)
  })
})
