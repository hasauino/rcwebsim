import type {
  ControlInputs,
  Simulation,
  SimulationOptions,
  Spawn,
  WindSettings,
} from './simulation'
import { DEFAULT_WIND } from './simulation'

/** A run of identical inputs held for `steps` fixed steps. */
export interface RecordedFrame {
  steps: number
  inputs: ControlInputs
  /** Wind changed by the pilot, applied before this frame's first step. */
  wind?: WindSettings
}

/**
 * Everything needed to reproduce a flight: the sim is deterministic, so the
 * starting conditions plus the stick inputs per step are enough.
 */
export interface FlightRecording {
  version: 1
  aircraftId: string
  seed: number
  wind: WindSettings
  spawn: Spawn
  frames: RecordedFrame[]
}

export class FlightRecorder {
  private readonly frames: RecordedFrame[] = []
  private readonly start: Omit<FlightRecording, 'frames' | 'version'>
  private pendingWind: WindSettings | undefined

  constructor(options: SimulationOptions) {
    this.start = {
      aircraftId: options.aircraft.id,
      seed: options.seed ?? 1,
      wind: { ...(options.wind ?? DEFAULT_WIND) },
      spawn: options.spawn ?? { kind: 'runway' },
    }
  }

  record(inputs: ControlInputs): void {
    const last = this.frames[this.frames.length - 1]
    if (last && !this.pendingWind && sameInputs(last.inputs, inputs)) {
      last.steps++
      return
    }
    const frame: RecordedFrame = { steps: 1, inputs: { ...inputs } }
    if (this.pendingWind) frame.wind = this.pendingWind
    this.pendingWind = undefined
    this.frames.push(frame)
  }

  /** Call when the wind is changed mid-flight (before the next `record`). */
  setWind(wind: WindSettings): void {
    this.pendingWind = { ...wind }
  }

  finish(): FlightRecording {
    return { version: 1, ...this.start, frames: this.frames.map((f) => ({ ...f })) }
  }
}

/** Resets `sim` to the recording's starting conditions and plays it through. */
export function replay(sim: Simulation, recording: FlightRecording): void {
  if (recording.aircraftId !== sim.aircraft.id)
    throw new Error(`recording is for ${recording.aircraftId}, sim flies ${sim.aircraft.id}`)
  sim.setWind(recording.wind)
  sim.reset(recording.spawn, recording.seed)
  for (const frame of recording.frames) {
    if (frame.wind) sim.setWind(frame.wind)
    for (let i = 0; i < frame.steps; i++) sim.step(frame.inputs)
  }
}

function sameInputs(a: ControlInputs, b: ControlInputs): boolean {
  return (
    a.aileron === b.aileron &&
    a.elevator === b.elevator &&
    a.rudder === b.rudder &&
    a.throttle === b.throttle &&
    a.flap === b.flap
  )
}
