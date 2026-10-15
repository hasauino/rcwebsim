import type { Channel } from '../sim/aircraft/types'
import { DETECT_TRAVEL, normaliseAxis, type AxisMapping } from './axis'

/**
 * centre: trims and sticks centred, throttle low, flaps up.
 * aileron..flap: move that control fully right / back / up / to full flap.
 * sweep: every stick, switch and knob to its limits.
 * still: hands off until the cable reads steady.
 */
export type RadioSetupStep =
  'centre' | 'aileron' | 'elevator' | 'rudder' | 'throttle' | 'flap' | 'sweep' | 'still' | 'done'

export interface RadioSetupView {
  step: RadioSetupStep
  /** Channels whose axis has been found. */
  assigned: Channel[]
  /** In the still step: nothing has shaken since the check (re)started. */
  steady: boolean
  /** Sticks resting away from centre once set up: a trim or sub-trim that wasn't centred. */
  offCentre: { channel: Channel; value: number }[]
}

const ASSIGN_ORDER: Channel[] = ['aileron', 'elevator', 'rudder', 'throttle', 'flap']
const STICKS: Channel[] = ['aileron', 'elevator', 'rudder']

/** How long the radio must read steady, s. */
const STILL_SECONDS = 1
/** Half peak-to-peak jitter, as a fraction of half travel, that still counts as steady. */
const STEADY = 0.02
/** A stick resting further than this from centre is reported. */
const OFF_CENTRE = 0.03

/**
 * Sets a radio up on a sim cable, the way RealFlight's and Aerofly's wizards
 * do: each channel is found by moving its control, and each axis is scaled
 * from a full sweep. The centre is the middle of the sweep rather than where
 * the stick rests, so a trim set on the radio afterwards still reaches the
 * plane. The still check measures the cable's jitter for the deadband.
 */
export class RadioSetup {
  private step: RadioSetupStep = 'centre'
  private rest: number[] = []
  private readonly found: Partial<Record<Channel, { index: number; invert: boolean }>> = {}
  private min: number[] = []
  private max: number[] = []
  /** Each axis's range while the radio is meant to be still, and how long it has been steady. */
  private stillWindow = { min: [] as number[], max: [] as number[], seconds: 0 }
  private steady = false
  private offCentre: RadioSetupView['offCentre'] = []

  constructor(
    /** Called once, when set up, with each channel's mapping. */
    private readonly save: (channels: Record<Channel, AxisMapping>) => void,
    private readonly onClose: () => void,
  ) {}

  view(): RadioSetupView {
    return {
      step: this.step,
      assigned: ASSIGN_ORDER.filter((c) => this.found[c]),
      steady: this.steady,
      offCentre: this.offCentre.map((o) => ({ ...o })),
    }
  }

  /** Moves on from the centre, sweep and still steps. */
  next(): void {
    if (this.step === 'centre') this.step = 'aileron'
    else if (this.step === 'sweep') this.startStill()
  }

  /** Skips the flap channel, for a radio without one. */
  skip(): void {
    if (this.step === 'flap') this.step = 'sweep'
  }

  /** Ends the setup. Until it is done, nothing is saved. */
  close(): void {
    this.onClose()
  }

  /** Feeds one frame of the cable's raw axes. */
  update(axes: readonly number[], dt: number): void {
    axes.forEach((v, i) => {
      this.min[i] = Math.min(this.min[i] ?? v, v)
      this.max[i] = Math.max(this.max[i] ?? v, v)
    })
    const step = this.step
    if (step === 'centre') {
      this.rest = [...axes]
      this.min = [...axes]
      this.max = [...axes]
    } else if (ASSIGN_ORDER.includes(step as Channel)) {
      this.detect(step as Channel, axes)
    } else if (step === 'still') {
      this.checkStill(axes, dt)
    }
  }

  /** Takes the axis moved furthest from rest, if far enough, for `channel`. */
  private detect(channel: Channel, axes: readonly number[]): void {
    const used = new Set(Object.values(this.found).map((f) => f.index))
    let best = -1
    let delta = 0
    axes.forEach((v, i) => {
      const d = v - (this.rest[i] ?? v)
      if (!used.has(i) && Math.abs(d) > Math.abs(delta)) {
        best = i
        delta = d
      }
    })
    if (Math.abs(delta) < DETECT_TRAVEL) return
    this.found[channel] = { index: best, invert: delta < 0 }
    const next = ASSIGN_ORDER[ASSIGN_ORDER.indexOf(channel) + 1]
    this.step = next ?? 'sweep'
  }

  private startStill(): void {
    this.step = 'still'
    this.stillWindow = { min: [], max: [], seconds: 0 }
    this.steady = false
  }

  private checkStill(axes: readonly number[], dt: number): void {
    const w = this.stillWindow
    let shaking = false
    for (const c of ASSIGN_ORDER) {
      const f = this.found[c]
      const v = f && axes[f.index]
      if (f === undefined || v === undefined) continue
      w.min[f.index] = Math.min(w.min[f.index] ?? v, v)
      w.max[f.index] = Math.max(w.max[f.index] ?? v, v)
      if (this.jitter(f.index) > STEADY) shaking = true
    }
    if (shaking) {
      w.min = [...axes]
      w.max = [...axes]
      w.seconds = 0
      this.steady = false
      return
    }
    this.steady = true
    w.seconds += dt
    if (w.seconds >= STILL_SECONDS) this.finish()
  }

  /** Half peak-to-peak movement in the still window, as a fraction of half travel. */
  private jitter(index: number): number {
    const w = this.stillWindow
    const travel = ((this.max[index] ?? 1) - (this.min[index] ?? -1)) / 2 || 1
    return ((w.max[index] ?? 0) - (w.min[index] ?? 0)) / 2 / travel
  }

  private finish(): void {
    const channels = {} as Record<Channel, AxisMapping>
    this.offCentre = []
    for (const c of ASSIGN_ORDER) {
      const f = this.found[c]
      if (!f) {
        channels[c] = { index: -1, invert: false, min: -1, center: 0, max: 1 }
        continue
      }
      const min = this.min[f.index] ?? -1
      const max = this.max[f.index] ?? 1
      const mapping: AxisMapping = {
        index: f.index,
        invert: f.invert,
        min,
        center: (min + max) / 2,
        max,
      }
      if (STICKS.includes(c)) {
        mapping.deadzone = Math.min(0.02, Math.max(0.002, 2 * this.jitter(f.index)))
        const restRaw =
          ((this.stillWindow.min[f.index] ?? 0) + (this.stillWindow.max[f.index] ?? 0)) / 2
        const value = normaliseAxis(restRaw, mapping, 0)
        if (Math.abs(value) > OFF_CENTRE) this.offCentre.push({ channel: c, value })
      }
      channels[c] = mapping
    }
    this.save(channels)
    this.step = 'done'
  }
}
