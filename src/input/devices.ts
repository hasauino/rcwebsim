import {
  MODE_LAYOUT,
  type Gimbal,
  type StickChannel,
  type StickMode,
  type TransmitterState,
} from './transmitter'

export const GIMBALS: Gimbal[] = ['leftX', 'leftY', 'rightX', 'rightY']

export interface AxisMapping {
  /** Gamepad axis index, or -1 for unassigned. */
  index: number
  invert: boolean
  min: number
  center: number
  max: number
}

export type SwitchAction = 'rates' | 'flaps' | 'throttleHold' | 'reset' | 'camera'

/** Per-device mapping: which axis is which gimbal, and which buttons flip switches. */
export interface GamepadProfile {
  axes: Record<Gimbal, AxisMapping>
  /** Self-centring throttle sticks (gamepads) move throttle incrementally. */
  throttleStyle: 'absolute' | 'incremental'
  deadzone: number
  buttons: Partial<Record<SwitchAction, number>>
}

const axis = (index: number, invert = false): AxisMapping => ({
  index,
  invert,
  min: -1,
  center: 0,
  max: 1,
})

/**
 * Sensible starting mapping. Standard-mapping gamepads use the usual stick
 * axes; anything else is assumed to be an RC radio in joystick mode with
 * channels in AETR order (aileron, elevator, throttle, rudder).
 */
export function defaultGamepadProfile(pad: Gamepad, mode: StickMode): GamepadProfile {
  if (pad.mapping === 'standard') {
    return {
      axes: { leftX: axis(0), leftY: axis(1), rightX: axis(2), rightY: axis(3) },
      throttleStyle: 'incremental',
      deadzone: 0.06,
      buttons: { flaps: 0, rates: 1, throttleHold: 2, camera: 3, reset: 9 },
    }
  }
  const layout = MODE_LAYOUT[mode]
  const aetr: Record<StickChannel, number> = { aileron: 0, elevator: 1, throttle: 2, rudder: 3 }
  const axes = {} as Record<Gimbal, AxisMapping>
  for (const [channel, gimbal] of Object.entries(layout) as [StickChannel, Gimbal][]) {
    // Radios report stick-up as positive; gimbal convention is up = -1.
    axes[gimbal] = axis(aetr[channel], gimbal.endsWith('Y'))
  }
  return { axes, throttleStyle: 'absolute', deadzone: 0.01, buttons: {} }
}

export function normaliseAxis(raw: number, m: AxisMapping, deadzone: number): number {
  let v =
    raw >= m.center
      ? (raw - m.center) / (m.max - m.center || 1)
      : (raw - m.center) / (m.center - m.min || 1)
  v = Math.max(-1, Math.min(1, v))
  if (Math.abs(v) < deadzone) v = 0
  return m.invert ? -v : v
}

type KeyChannel = 'aileron' | 'elevator' | 'rudder'

const KEY_AXES: Record<string, [KeyChannel, number]> = {
  ArrowLeft: ['aileron', -1],
  ArrowRight: ['aileron', 1],
  ArrowUp: ['elevator', -1],
  ArrowDown: ['elevator', 1],
  KeyA: ['rudder', -1],
  KeyD: ['rudder', 1],
}

/** Stick travel per second for keyboard "sticks" and throttle. */
const KEY_STICK_RATE = 4
const THROTTLE_RATE = 0.6

export type TrimChannel = 'aileron' | 'elevator' | 'rudder'

export interface InputEvents {
  reset?: () => void
  airStart?: () => void
  camera?: () => void
  pause?: () => void
  debug?: () => void
  /** Nudge a channel's trim by `step` (fraction of full travel). */
  trim?: (channel: TrimChannel, step: number) => void
}

/** One click of a transmitter trim button. */
const TRIM_STEP = 0.005

const TRIM_KEYS: Record<string, [TrimChannel, number]> = {
  KeyI: ['elevator', -TRIM_STEP],
  KeyK: ['elevator', TRIM_STEP],
  KeyJ: ['aileron', -TRIM_STEP],
  KeyL: ['aileron', TRIM_STEP],
  KeyU: ['rudder', -TRIM_STEP],
  KeyO: ['rudder', TRIM_STEP],
}

/**
 * Reads the keyboard and the first connected gamepad and maintains the
 * virtual transmitter's stick/switch state.
 */
export class InputDevices {
  readonly state: TransmitterState
  /** Gamepad id currently driving the sticks, if any. */
  activePad: string | null = null
  /** Live raw axis values and button states of the active pad, for the mapping UI. */
  rawAxes: number[] = []
  rawButtons: boolean[] = []

  private readonly held = new Set<string>()
  private keyStick: Record<KeyChannel, number> = { aileron: 0, elevator: 0, rudder: 0 }
  private throttle = 0
  private lastButtons: boolean[] = []
  private padTouched = false

  constructor(
    state: TransmitterState,
    private getMode: () => StickMode,
    private getProfile: (pad: Gamepad) => GamepadProfile,
    private events: InputEvents,
  ) {
    this.state = state
    this.throttle = Math.max(
      0,
      Math.min(1, (1 - state.sticks[MODE_LAYOUT[getMode()].throttle]) / 2),
    )
  }

  attach(target: Window): () => void {
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return
      if (e.code in KEY_AXES || e.code === 'KeyW' || e.code === 'KeyS') e.preventDefault()
      if (!e.repeat) this.onKey(e.code)
      this.held.add(e.code)
    }
    const up = (e: KeyboardEvent) => this.held.delete(e.code)
    const blur = () => this.held.clear()
    target.addEventListener('keydown', down)
    target.addEventListener('keyup', up)
    target.addEventListener('blur', blur)
    return () => {
      target.removeEventListener('keydown', down)
      target.removeEventListener('keyup', up)
      target.removeEventListener('blur', blur)
    }
  }

  /** Call once per rendered frame. */
  update(dt: number): void {
    const layout = MODE_LAYOUT[this.getMode()]
    const pad = this.pollGamepad(dt)

    // Keyboard sticks spring back to centre like a real gimbal.
    const keysActive = [...this.held].some((k) => k in KEY_AXES || k === 'KeyW' || k === 'KeyS')
    for (const channel of ['aileron', 'elevator', 'rudder'] as const) {
      let target = 0
      for (const code of this.held) {
        const binding = KEY_AXES[code]
        if (binding && binding[0] === channel) target += binding[1]
      }
      if (this.held.has('ShiftLeft') || this.held.has('ShiftRight')) target *= 0.4
      const v = this.keyStick[channel]
      this.keyStick[channel] =
        v + Math.max(-KEY_STICK_RATE * dt, Math.min(KEY_STICK_RATE * dt, target - v))
    }
    if (this.held.has('KeyW')) this.throttle = Math.min(1, this.throttle + THROTTLE_RATE * dt)
    if (this.held.has('KeyS')) this.throttle = Math.max(0, this.throttle - THROTTLE_RATE * dt)

    if (pad && !keysActive) {
      Object.assign(this.state.sticks, pad)
      this.syncThrottleFromSticks(layout.throttle)
      return
    }
    const sticks = this.state.sticks
    for (const channel of ['aileron', 'elevator', 'rudder'] as const) {
      sticks[layout[channel]] = this.keyStick[channel]
    }
    sticks[layout.throttle] = 1 - 2 * this.throttle
  }

  private syncThrottleFromSticks(gimbal: Gimbal): void {
    this.throttle = Math.max(0, Math.min(1, (1 - this.state.sticks[gimbal]) / 2))
  }

  private pollGamepad(dt: number): Record<Gimbal, number> | null {
    const pads =
      typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []
    const pad = [...pads].find((p): p is Gamepad => !!p && p.connected)
    if (!pad) {
      this.activePad = null
      return null
    }
    this.activePad = pad.id
    const profile = this.getProfile(pad)
    const layout = MODE_LAYOUT[this.getMode()]
    this.rawAxes = [...pad.axes]

    const out = { leftX: 0, leftY: 0, rightX: 0, rightY: 0 } as Record<Gimbal, number>
    for (const g of GIMBALS) {
      const m = profile.axes[g]
      out[g] =
        m.index >= 0 && m.index < pad.axes.length
          ? normaliseAxis(pad.axes[m.index]!, m, profile.deadzone)
          : 0
    }
    if (profile.throttleStyle === 'incremental') {
      // Self-centring stick: forward raises, back lowers.
      const t = out[layout.throttle]
      this.throttle = Math.max(0, Math.min(1, this.throttle - t * THROTTLE_RATE * dt))
      out[layout.throttle] = 1 - 2 * this.throttle
    }

    // Edge-triggered switches.
    const pressed = pad.buttons.map((b) => b.pressed)
    this.rawButtons = pressed
    for (const [action, index] of Object.entries(profile.buttons) as [SwitchAction, number][]) {
      if (pressed[index] && !this.lastButtons[index]) this.onSwitch(action)
    }
    this.lastButtons = pressed

    // Only take over from the keyboard once the pad is actually used.
    if (!this.padTouched) {
      this.padTouched = GIMBALS.some((g) => g !== layout.throttle && Math.abs(out[g]) > 0.2)
      if (!this.padTouched) return null
    }
    return out
  }

  /** Sets the keyboard / self-centring-gamepad throttle (0..1). */
  setThrottle(value: number): void {
    this.throttle = Math.max(0, Math.min(1, value))
  }

  private onKey(code: string): void {
    const trim = TRIM_KEYS[code]
    if (trim) {
      this.events.trim?.(...trim)
      return
    }
    switch (code) {
      case 'KeyF':
        this.onSwitch('flaps')
        break
      case 'KeyE':
        this.onSwitch('rates')
        break
      case 'KeyH':
        this.onSwitch('throttleHold')
        break
      case 'KeyR':
        this.onSwitch('reset')
        break
      case 'KeyT':
        this.events.airStart?.()
        break
      case 'KeyC':
        this.onSwitch('camera')
        break
      case 'KeyP':
        this.events.pause?.()
        break
      case 'KeyG':
        this.events.debug?.()
        break
    }
  }

  private onSwitch(action: SwitchAction): void {
    const s = this.state
    if (action === 'flaps') s.flapSwitch = ((s.flapSwitch + 1) % 3) as 0 | 1 | 2
    else if (action === 'rates') s.highRates = !s.highRates
    else if (action === 'throttleHold') s.throttleHold = !s.throttleHold
    else if (action === 'reset') this.events.reset?.()
    else if (action === 'camera') this.events.camera?.()
  }
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')
}
