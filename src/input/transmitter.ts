import type { ControlInputs } from '../sim/simulation'

/**
 * A virtual RC transmitter: turns stick and switch positions into receiver
 * channels, the way a real radio's model memory does (stick mode, dual
 * rates, expo, trims, throttle hold, flap switch and flap -> elevator mix).
 */

export type StickMode = 1 | 2 | 3 | 4
export type Gimbal = 'leftX' | 'leftY' | 'rightX' | 'rightY'
export type StickChannel = 'aileron' | 'elevator' | 'rudder' | 'throttle'

/** Which gimbal axis drives which channel, per stick mode. */
export const MODE_LAYOUT: Record<StickMode, Record<StickChannel, Gimbal>> = {
  1: { rudder: 'leftX', elevator: 'leftY', aileron: 'rightX', throttle: 'rightY' },
  2: { rudder: 'leftX', throttle: 'leftY', aileron: 'rightX', elevator: 'rightY' },
  3: { aileron: 'leftX', elevator: 'leftY', rudder: 'rightX', throttle: 'rightY' },
  4: { aileron: 'leftX', throttle: 'leftY', rudder: 'rightX', elevator: 'rightY' },
}

export interface ChannelSettings {
  /** Dual-rate travel at low rates, 0..1 (high rate is always full throw). */
  lowRate: number
  /** Expo 0..1: softens the centre of the stick. */
  expo: number
  /** Trim offset, -0.25..0.25 of full travel. */
  trim: number
  reverse: boolean
}

export interface TransmitterSettings {
  mode: StickMode
  channels: Record<'aileron' | 'elevator' | 'rudder', ChannelSettings>
  /** Elevator added per unit flap (negative = down elevator). */
  flapElevatorMix: number
}

/**
 * Stick and switch positions. Gimbals are -1..1 with +1 = right / towards
 * the pilot (pulled back), the same convention as the Gamepad API.
 */
export interface TransmitterState {
  sticks: Record<Gimbal, number>
  highRates: boolean
  /** 0 = up, 1 = half, 2 = full. */
  flapSwitch: 0 | 1 | 2
  throttleHold: boolean
}

export type LowRates = Partial<Record<StickChannel, number>>

export function defaultTransmitter(lowRates: LowRates = {}): TransmitterSettings {
  const channel = (name: StickChannel, expo: number): ChannelSettings => ({
    lowRate: lowRates[name] ?? 0.7,
    expo,
    trim: 0,
    reverse: false,
  })
  return {
    mode: 2,
    channels: {
      aileron: channel('aileron', 0.3),
      elevator: channel('elevator', 0.3),
      rudder: channel('rudder', 0.2),
    },
    flapElevatorMix: 0,
  }
}

export function neutralSticks(): TransmitterState {
  return {
    sticks: { leftX: 0, leftY: 1, rightX: 0, rightY: 0 },
    highRates: true,
    flapSwitch: 0,
    throttleHold: false,
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function shape(x: number, s: ChannelSettings, highRates: boolean): number {
  const curved = s.expo * x * x * x + (1 - s.expo) * x
  const rate = highRates ? 1 : s.lowRate
  return clamp((s.reverse ? -curved : curved) * rate + s.trim, -1, 1)
}

/** Computes receiver channels from the transmitter's stick and switch state. */
export function mixChannels(settings: TransmitterSettings, state: TransmitterState): ControlInputs {
  const layout = MODE_LAYOUT[settings.mode]
  const stick = (c: StickChannel) => state.sticks[layout[c]]
  const { channels, flapElevatorMix } = settings

  // Throttle: stick fully forward (-1) = full power.
  const throttle = state.throttleHold ? 0 : clamp((1 - stick('throttle')) / 2, 0, 1)
  // Elevator: pulled back (+1) = nose up = positive channel.
  const flap = state.flapSwitch / 2
  const elevator = clamp(
    shape(stick('elevator'), channels.elevator, state.highRates) + flapElevatorMix * flap,
    -1,
    1,
  )
  return {
    aileron: shape(stick('aileron'), channels.aileron, state.highRates),
    elevator,
    rudder: shape(stick('rudder'), channels.rudder, state.highRates),
    throttle,
    flap,
  }
}
