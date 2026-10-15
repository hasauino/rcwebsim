import type { Channel } from '../sim/aircraft/types'
import type { ControlInputs } from '../sim/simulation'
import { DETECT_TRAVEL, normaliseAxis, type AxisMapping } from './axis'
import { RadioSetup } from './radio-setup'
import {
  MODE_LAYOUT,
  mixChannels,
  type Gimbal,
  type StickMode,
  type TransmitterSettings,
  type TransmitterState,
} from './transmitter'

export { normaliseAxis, type AxisMapping } from './axis'

export const GIMBALS: Gimbal[] = ['leftX', 'leftY', 'rightX', 'rightY']
export const CHANNELS: Channel[] = ['aileron', 'elevator', 'throttle', 'rudder', 'flap']

export type SwitchAction = 'rates' | 'flaps' | 'throttleHold' | 'reset' | 'camera'

/**
 * What flips a switch action: a gamepad button (each press toggles), or a
 * radio switch arriving as an axis, whose position is the switch state.
 */
export type SwitchBinding = { button: number } | { axis: number; positions: 2 | 3; invert: boolean }

interface ProfileBase {
  deadzone: number
  switches: Partial<Record<SwitchAction, SwitchBinding>>
}

/** A gamepad: axes drive the transmitter's gimbals. */
export interface GamepadProfile extends ProfileBase {
  kind: 'gamepad'
  axes: Record<Gimbal, AxisMapping>
  /** Self-centring throttle sticks (gamepads) move throttle incrementally. */
  throttleStyle: 'absolute' | 'incremental'
}

/**
 * An RC transmitter through a USB sim cable: axes are the radio's channels,
 * already placed on sticks by the radio's own stick mode.
 */
export interface RadioProfile extends ProfileBase {
  kind: 'radio'
  channels: Record<Channel, AxisMapping>
  /**
   * The radio does rates, expo, trims, mixes and throttle cut, and the sim
   * is only the receiver. Off, the sim's transmitter shapes the radio's
   * sticks (for radios whose trainer output bypasses their settings).
   */
  receiverOnly: boolean
}

/** Per-device mapping, saved by gamepad id. */
export type DeviceProfile = GamepadProfile | RadioProfile

const axis = (index: number, invert = false): AxisMapping => ({
  index,
  invert,
  min: -1,
  center: 0,
  max: 1,
})

/**
 * Sensible starting mapping. Standard-mapping gamepads use the usual stick
 * axes; anything else is assumed to be an RC radio on a sim cable.
 */
export function defaultProfile(pad: Gamepad): DeviceProfile {
  return pad.mapping === 'standard' ? gamepadDefaults() : radioDefaults()
}

/** A standard-mapping gamepad: the usual stick axes, face buttons for the switches. */
export function gamepadDefaults(): GamepadProfile {
  return {
    kind: 'gamepad',
    axes: { leftX: axis(0), leftY: axis(1), rightX: axis(2), rightY: axis(3) },
    throttleStyle: 'incremental',
    deadzone: 0.06,
    switches: {
      flaps: { button: 0 },
      rates: { button: 1 },
      throttleHold: { button: 2 },
      camera: { button: 3 },
      reset: { button: 9 },
    },
  }
}

/** A radio on a sim cable with channels in AETR order (aileron, elevator, throttle, rudder). */
export function radioDefaults(): RadioProfile {
  return {
    kind: 'radio',
    // Radios report the elevator stick pushed forward as positive.
    channels: {
      aileron: axis(0),
      elevator: axis(1, true),
      throttle: axis(2),
      rudder: axis(3),
      flap: axis(-1),
    },
    receiverOnly: true,
    deadzone: 0.01,
    switches: {},
  }
}

/** A profile saved before profiles had a kind: gamepads keep theirs, radios start over. */
interface LegacyProfile {
  kind?: undefined
  axes: Record<Gimbal, AxisMapping>
  throttleStyle: 'absolute' | 'incremental'
  deadzone: number
  buttons?: Partial<Record<SwitchAction, number>>
}

function upgradeProfile(saved: DeviceProfile | LegacyProfile, pad: Gamepad): DeviceProfile {
  if (saved.kind) return saved
  if (pad.mapping !== 'standard') return radioDefaults()
  const switches: GamepadProfile['switches'] = {}
  for (const [action, button] of Object.entries(saved.buttons ?? {}))
    switches[action as SwitchAction] = { button }
  return {
    kind: 'gamepad',
    axes: saved.axes,
    throttleStyle: saved.throttleStyle,
    deadzone: saved.deadzone,
    switches,
  }
}

/** A mapped axis's value, or 0 when it is unassigned or missing. */
function readAxis(axes: readonly number[], m: AxisMapping, deadzone: number): number {
  const raw = m.index >= 0 ? axes[m.index] : undefined
  return raw === undefined ? 0 : normaliseAxis(raw, m, deadzone)
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

/** Keys that walk the pilot in walk mode; otherwise they fly throttle and rudder. */
const WALK_KEYS = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD'])

/** Stick travel per second for keyboard "sticks" and throttle. */
const KEY_STICK_RATE = 4
const THROTTLE_RATE = 0.6

/** The keys walking the pilot in walk mode. */
export interface WalkKeys {
  /** -1..1: ahead (+) or back. */
  forward: number
  /** -1..1: right (+) or left. */
  right: number
  running: boolean
}

export type TrimChannel = 'aileron' | 'elevator' | 'rudder'

export interface InputEvents {
  reset?: () => void
  airStart?: () => void
  handLaunch?: () => void
  camera?: () => void
  pause?: () => void
  debug?: () => void
  /** Walk mode turned on or off. */
  walkMode?: (walking: boolean) => void
  /** Walk the pilot back to the pilot station. */
  pilotStation?: () => void
  /** Nudge a channel's trim by `step` (fraction of full travel). */
  trim?: (channel: TrimChannel, step: number) => void
}

/** Axis travel that counts as a gamepad being moved (and so flown). */
const MOVE_THRESHOLD = 0.2

/** A flying gamepad's output: transmitter gimbals, or a radio's own receiver channels. */
type PadOutput = { sticks: Record<Gimbal, number> } | { receiver: ControlInputs }

/** One click of a transmitter trim button. */
const TRIM_STEP = 0.005

export type StickSide = 'left' | 'right'
export type InputSource = 'keyboard' | 'gamepad' | 'touch'

const SIDE_GIMBALS: Record<StickSide, { x: Gimbal; y: Gimbal }> = {
  left: { x: 'leftX', y: 'leftY' },
  right: { x: 'rightX', y: 'rightY' },
}

/** A thumb on a touch stick; travel is in fractions of full stick throw. */
interface HeldTouch {
  x: number
  y: number
  /** Throttle (0..1) when the finger landed; a throttle gimbal moves on from it. */
  throttle: number
}

const TRIM_KEYS: Record<string, [TrimChannel, number]> = {
  KeyI: ['elevator', -TRIM_STEP],
  KeyK: ['elevator', TRIM_STEP],
  KeyJ: ['aileron', -TRIM_STEP],
  KeyL: ['aileron', TRIM_STEP],
  KeyU: ['rudder', -TRIM_STEP],
  KeyO: ['rudder', TRIM_STEP],
}

/**
 * Reads the keyboard, the touch sticks and the first connected gamepad and
 * maintains the virtual transmitter's stick/switch state.
 */
export class InputDevices {
  readonly state: TransmitterState
  /**
   * The gamepad the mapping UI shows and the pilot flies with: the pinned
   * one, else the one last moved, else the first plugged in.
   */
  activePad: string | null = null
  /** Every connected gamepad's id. */
  pads: string[] = []
  /** Fly with this gamepad only; null follows whichever was moved last. */
  pinnedPad: string | null = null
  /** Live raw axis values and button states of the active pad, for the mapping UI. */
  rawAxes: number[] = []
  rawButtons: boolean[] = []
  /** The device last used to fly (stick keys, a touch, gamepad sticks or buttons), or null before any. */
  lastInput: InputSource | null = null
  /** The radio flying the plane has gone: like a receiver, cut the throttle and hold the surfaces. */
  failsafe = false
  /** A switch action waiting to be bound to the next switch flipped or button pressed. */
  learning: SwitchAction | null = null
  /** A radio being set up on the active pad, if any. */
  setup: RadioSetup | null = null
  /** Walk mode: W/A/S/D walk the pilot instead of flying throttle and rudder. */
  walking = false
  /** The pilot's walking keys, while in walk mode. */
  readonly walk: WalkKeys = { forward: 0, right: 0, running: false }

  private readonly held = new Set<string>()
  private keyStick: Record<KeyChannel, number> = { aileron: 0, elevator: 0, rudder: 0 }
  private throttle = 0
  private lastButtons: boolean[] = []
  private readonly lastSwitch: Partial<Record<SwitchAction, number>> = {}
  /** Each pad's axes when it was last outdone by another, to tell when it moves. */
  private readonly restAxes = new Map<string, number[]>()
  /** Pads moved since they were plugged in; only these fly. */
  private readonly movedPads = new Set<string>()
  /** Each pad's buttons last frame, to count a press once. */
  private readonly padButtons = new Map<string, boolean[]>()
  private lastMoved: string | null = null
  private setupPad: string | null = null
  private learnPositions: 2 | 3 = 2
  /** The active pad's axes when learning started, to spot the switch that moves. */
  private learnAxes: number[] = []
  /** The radio flying this frame, when it is only the receiver's source. */
  private receiver: ControlInputs | null = null
  /** In failsafe, the lost radio was the transmitter (not shaped by the sim's). */
  private failedReceiver = false
  /** The pad whose sticks flew last frame. */
  private flyingPad: string | null = null
  private lastOutput: ControlInputs = { aileron: 0, elevator: 0, rudder: 0, throttle: 0, flap: 0 }
  private readonly touches: Partial<Record<StickSide, HeldTouch>> = {}

  constructor(
    state: TransmitterState,
    private getMode: () => StickMode,
    /** Saved profiles by gamepad id; a new device's default profile is added here. */
    private profiles: () => Record<string, DeviceProfile>,
    private events: InputEvents,
  ) {
    this.state = state
    this.throttle = Math.max(
      0,
      Math.min(1, (1 - state.sticks[MODE_LAYOUT[getMode()].throttle]) / 2),
    )
  }

  /** The radio is the transmitter: its channels fly the plane and the sim's transmitter is bypassed. */
  get radioIsTransmitter(): boolean {
    return this.receiver !== null || (this.failsafe && this.failedReceiver)
  }

  /**
   * The receiver's channels this frame: a radio's own, or the sim
   * transmitter's mix of the sticks. In failsafe the throttle is cut and the
   * surfaces hold where they were.
   */
  channels(transmitter: TransmitterSettings): ControlInputs {
    if (this.failsafe) return { ...this.lastOutput, throttle: 0 }
    const out = this.receiver ? { ...this.receiver } : mixChannels(transmitter, this.state)
    this.lastOutput = out
    return out
  }

  /**
   * Starts setting up the active pad as a radio on a sim cable. While it runs
   * the pad doesn't fly; once done the pad's profile is the radio's.
   */
  startRadioSetup(): RadioSetup | null {
    const id = this.activePad
    if (!id) return null
    this.setup = new RadioSetup(
      (channels) => {
        const old = this.profiles()[id]
        this.profiles()[id] = {
          kind: 'radio',
          channels,
          receiverOnly: old?.kind === 'radio' ? old.receiverOnly : true,
          deadzone: 0,
          switches: old?.switches ?? {},
        }
      },
      () => (this.setup = null),
    )
    this.setupPad = id
    this.setup.update(this.rawAxes, 0)
    return this.setup
  }

  /**
   * Binds `action` to the next button pressed or, on a radio, the next switch
   * flipped (a non-stick axis moving). The switch is flipped to its on position.
   */
  learnSwitch(action: SwitchAction, positions: 2 | 3): void {
    this.learning = action
    this.learnPositions = positions
    this.learnAxes = [...this.rawAxes]
  }

  /** The profile for a gamepad, creating or upgrading it as needed. */
  profileFor(pad: Gamepad): DeviceProfile {
    const profiles = this.profiles()
    const saved = profiles[pad.id] as DeviceProfile | LegacyProfile | undefined
    const profile = saved ? upgradeProfile(saved, pad) : defaultProfile(pad)
    if (profile !== saved) profiles[pad.id] = profile
    return profiles[pad.id]!
  }

  attach(target: Window): () => void {
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return
      if (this.fliesWith(e.code)) {
        e.preventDefault()
        this.lastInput = 'keyboard'
      }
      if (!e.repeat) this.onKey(e.code)
      this.held.add(e.code)
    }
    const up = (e: KeyboardEvent) => this.held.delete(e.code)
    const blur = () => this.held.clear()
    const pointer = (e: PointerEvent) => {
      if (e.pointerType === 'touch') this.lastInput = 'touch'
    }
    target.addEventListener('keydown', down)
    target.addEventListener('keyup', up)
    target.addEventListener('blur', blur)
    target.addEventListener('pointerdown', pointer)
    return () => {
      target.removeEventListener('keydown', down)
      target.removeEventListener('keyup', up)
      target.removeEventListener('blur', blur)
      target.removeEventListener('pointerdown', pointer)
    }
  }

  /** Call once per rendered frame. */
  update(dt: number): void {
    const layout = MODE_LAYOUT[this.getMode()]
    const pad = this.pollGamepad(dt)

    const shift = this.held.has('ShiftLeft') || this.held.has('ShiftRight')
    const walk = this.walk
    walk.forward = walk.right = 0
    walk.running = this.walking && shift
    if (this.walking) {
      walk.forward = +this.held.has('KeyW') - +this.held.has('KeyS')
      walk.right = +this.held.has('KeyD') - +this.held.has('KeyA')
    }

    // Keyboard sticks spring back to centre like a real gimbal.
    const keysActive = [...this.held].some((k) => this.fliesWith(k))
    for (const channel of ['aileron', 'elevator', 'rudder'] as const) {
      let target = 0
      for (const code of this.held) {
        const binding = KEY_AXES[code]
        if (binding && binding[0] === channel && this.fliesWith(code)) target += binding[1]
      }
      // In walk mode Shift runs instead.
      if (shift && !this.walking) target *= 0.4
      const v = this.keyStick[channel]
      this.keyStick[channel] =
        v + Math.max(-KEY_STICK_RATE * dt, Math.min(KEY_STICK_RATE * dt, target - v))
    }
    if (this.held.has('KeyW') && this.fliesWith('KeyW'))
      this.throttle = Math.min(1, this.throttle + THROTTLE_RATE * dt)
    if (this.held.has('KeyS') && this.fliesWith('KeyS'))
      this.throttle = Math.max(0, this.throttle - THROTTLE_RATE * dt)

    this.receiver = null
    const sticks = this.state.sticks
    const touched = Object.keys(this.touches) as StickSide[]
    if (touched.length) {
      this.flyingPad = null
      this.failsafe = false
      // Touch flies: untouched gimbals rest at centre, throttle where it was left.
      for (const g of GIMBALS) sticks[g] = 0
      for (const side of touched) {
        const touch = this.touches[side]!
        const { x, y } = SIDE_GIMBALS[side]
        sticks[x] = clampTravel(touch.x)
        if (y === layout.throttle) {
          this.throttle = Math.max(0, Math.min(1, touch.throttle - touch.y / 2))
        } else {
          sticks[y] = clampTravel(touch.y)
        }
      }
      sticks[layout.throttle] = 1 - 2 * this.throttle
      return
    }

    if (pad && !keysActive) {
      this.failedReceiver = 'receiver' in pad
      if ('receiver' in pad) {
        this.receiver = pad.receiver
        this.throttle = pad.receiver.throttle
      } else {
        Object.assign(this.state.sticks, pad.sticks)
        this.syncThrottleFromSticks(layout.throttle)
      }
      return
    }
    if (keysActive) {
      this.flyingPad = null
      this.failsafe = false
    }
    for (const channel of ['aileron', 'elevator', 'rudder'] as const) {
      sticks[layout[channel]] = this.keyStick[channel]
    }
    sticks[layout.throttle] = 1 - 2 * this.throttle
  }

  /** Whether a key flies the aircraft (stick or throttle), as opposed to walking or a switch. */
  private fliesWith(code: string): boolean {
    if (this.walking && WALK_KEYS.has(code)) return false
    return code in KEY_AXES || code === 'KeyW' || code === 'KeyS'
  }

  private syncThrottleFromSticks(gimbal: Gimbal): void {
    this.throttle = Math.max(0, Math.min(1, (1 - this.state.sticks[gimbal]) / 2))
  }

  /**
   * Reads the active gamepad: its gimbals, or a radio's receiver channels,
   * once it has been moved. Flips switches bound to it.
   */
  private pollGamepad(dt: number): PadOutput | null {
    const all =
      typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []
    const connected = [...all].filter((p): p is Gamepad => !!p && p.connected)
    this.pads = connected.map((p) => p.id)
    for (const id of [...this.movedPads]) if (!this.pads.includes(id)) this.movedPads.delete(id)
    if (this.flyingPad && !this.pads.includes(this.flyingPad)) {
      // A radio unplugged or switched off mid-flight: the receiver fails safe,
      // and no other device flies until it is moved.
      if (this.profiles()[this.flyingPad]?.kind === 'radio') {
        this.failsafe = true
        this.movedPads.clear()
        this.lastMoved = null
        for (const pad of connected) this.restAxes.set(pad.id, [...pad.axes])
      }
      this.flyingPad = null
    }
    this.followMovedPad(connected)

    const pad =
      connected.find((p) => p.id === this.pinnedPad) ??
      connected.find((p) => p.id === this.lastMoved) ??
      connected[0]
    if (!pad) {
      this.activePad = null
      return null
    }
    if (pad.id !== this.activePad) {
      this.lastButtons = []
      for (const action of Object.keys(this.lastSwitch))
        delete this.lastSwitch[action as SwitchAction]
    }
    this.activePad = pad.id
    const profile = this.profileFor(pad)
    this.rawAxes = [...pad.axes]
    this.rawButtons = pad.buttons.map((b) => b.pressed)

    if (this.setup) {
      if (pad.id === this.setupPad) this.setup.update(this.rawAxes, dt)
      return null
    }
    // Only take over from the keyboard once the pad is actually used.
    const flies = this.movedPads.has(pad.id)
    if (this.learning) this.learn(profile)
    else this.readSwitches(profile, flies)
    if (!flies) return null
    this.flyingPad = pad.id
    this.failsafe = false
    return profile.kind === 'radio' ? this.readRadio(profile) : this.readGamepad(profile, dt)
  }

  /** Notes which pads have moved since plugged in, and follows the last one moved. */
  private followMovedPad(connected: Gamepad[]): void {
    for (const pad of connected) {
      const rest = this.restAxes.get(pad.id)
      if (!rest) {
        this.restAxes.set(pad.id, [...pad.axes])
        this.padButtons.set(
          pad.id,
          pad.buttons.map((b) => b.pressed),
        )
        continue
      }
      const before = this.padButtons.get(pad.id) ?? []
      const buttons = pad.buttons.map((b) => b.pressed)
      this.padButtons.set(pad.id, buttons)
      // A button counts once, when pressed: one held down mustn't keep taking control.
      const moved =
        pad.axes.some((v, i) => Math.abs(v - (rest[i] ?? v)) > MOVE_THRESHOLD) ||
        buttons.some((b, i) => b && !before[i])
      if (!moved) continue
      this.restAxes.set(pad.id, [...pad.axes])
      this.movedPads.add(pad.id)
      this.lastInput = 'gamepad'
      if (pad.id === this.lastMoved) continue
      this.lastMoved = pad.id
      // Every other pad has to move again to take over.
      for (const other of connected) this.restAxes.set(other.id, [...other.axes])
    }
  }

  private readGamepad(profile: GamepadProfile, dt: number): PadOutput {
    const layout = MODE_LAYOUT[this.getMode()]
    const sticks = centredSticks()
    for (const g of GIMBALS) sticks[g] = readAxis(this.rawAxes, profile.axes[g], profile.deadzone)
    if (profile.throttleStyle === 'incremental') {
      // Self-centring stick: forward raises, back lowers.
      const t = sticks[layout.throttle]
      this.throttle = Math.max(0, Math.min(1, this.throttle - t * THROTTLE_RATE * dt))
      sticks[layout.throttle] = 1 - 2 * this.throttle
    }
    return { sticks }
  }

  private readRadio(profile: RadioProfile): PadOutput {
    const read = (c: Channel) =>
      readAxis(
        this.rawAxes,
        profile.channels[c],
        c === 'throttle' || c === 'flap' ? 0 : profile.deadzone,
      )
    // Throttle and flap run 0..1; with no axis they sit at idle and up.
    const half = (c: Channel) =>
      this.rawAxes[profile.channels[c].index] === undefined
        ? 0
        : Math.max(0, Math.min(1, (read(c) + 1) / 2))
    const receiver: ControlInputs = {
      aileron: read('aileron'),
      elevator: read('elevator'),
      rudder: read('rudder'),
      throttle: half('throttle'),
      flap: half('flap'),
    }
    if (profile.receiverOnly) return { receiver }
    // The sim's transmitter shapes the radio's sticks: put each channel back on its gimbal,
    // and a flap channel sets the flap switch.
    if (profile.channels.flap.index >= 0 && !profile.switches.flaps)
      this.state.flapSwitch = Math.round(receiver.flap * 2) as 0 | 1 | 2
    const layout = MODE_LAYOUT[this.getMode()]
    const sticks = centredSticks()
    sticks[layout.aileron] = receiver.aileron
    sticks[layout.elevator] = receiver.elevator
    sticks[layout.rudder] = receiver.rudder
    sticks[layout.throttle] = 1 - 2 * receiver.throttle
    return { sticks }
  }

  /**
   * Buttons toggle on each press. A switch on an axis sets its state from
   * where it sits (while the pad flies), and fires reset or camera on the
   * move into its on position.
   */
  private readSwitches(profile: DeviceProfile, flies: boolean): void {
    const pressed = this.rawButtons
    for (const [action, binding] of Object.entries(profile.switches) as [
      SwitchAction,
      SwitchBinding,
    ][]) {
      if ('button' in binding) {
        if (pressed[binding.button] && !this.lastButtons[binding.button]) {
          this.lastInput = 'gamepad'
          this.pressSwitch(action)
        }
        continue
      }
      const raw = this.rawAxes[binding.axis]
      if (raw === undefined) continue
      const position = switchPosition(binding.invert ? -raw : raw, binding.positions)
      const previous = this.lastSwitch[action]
      this.lastSwitch[action] = position
      if (action === 'reset' || action === 'camera') {
        if (previous !== undefined && previous === 0 && position > 0) this.pressSwitch(action)
      } else if (flies) {
        this.setSwitch(action, binding.positions === 2 ? position * 2 : position)
      }
    }
    this.lastButtons = pressed
  }

  private learn(profile: DeviceProfile): void {
    const action = this.learning!
    const pressed = this.rawButtons.findIndex((b, i) => b && !this.lastButtons[i])
    this.lastButtons = this.rawButtons
    if (pressed >= 0) {
      profile.switches[action] = { button: pressed }
      this.learning = null
      return
    }
    if (profile.kind !== 'radio') return
    const sticks = new Set(CHANNELS.map((c) => profile.channels[c].index))
    // Wait for the switch to reach an end: a three-position one passes through the middle.
    const axis = this.rawAxes.findIndex(
      (v, i) =>
        !sticks.has(i) &&
        Math.abs(v - (this.learnAxes[i] ?? v)) > DETECT_TRAVEL &&
        Math.abs(v) > DETECT_TRAVEL,
    )
    if (axis < 0) return
    profile.switches[action] = {
      axis,
      positions: this.learnPositions,
      invert: this.rawAxes[axis]! < 0,
    }
    this.learning = null
  }

  /** Sets a transmitter switch from a radio switch's position: 0 off, 1 middle, 2 on. */
  private setSwitch(action: 'rates' | 'flaps' | 'throttleHold', position: number): void {
    const s = this.state
    if (action === 'flaps') s.flapSwitch = position as 0 | 1 | 2
    else if (action === 'rates') s.highRates = position > 0
    else s.throttleHold = position > 0
  }

  /** A thumb lands on a touch stick: that spot is the stick's centre. */
  touchDown(side: StickSide): void {
    this.touches[side] = { x: 0, y: 0, throttle: this.throttle }
    this.lastInput = 'touch'
  }

  /**
   * The finger has moved `dx`, `dy` from where it landed, in fractions of
   * full stick travel (+x right, +y towards the pilot).
   */
  touchMove(side: StickSide, dx: number, dy: number): void {
    const touch = this.touches[side]
    if (!touch) return
    touch.x = dx
    touch.y = dy
  }

  /** The finger lifts: centring gimbals spring back. */
  touchUp(side: StickSide): void {
    delete this.touches[side]
  }

  /** Sets the keyboard / self-centring-gamepad / touch throttle (0..1). */
  setThrottle(value: number): void {
    this.throttle = Math.max(0, Math.min(1, value))
    // A thumb held on the throttle moves on from the new setting.
    for (const touch of Object.values(this.touches)) touch.throttle = this.throttle + touch.y / 2
  }

  private onKey(code: string): void {
    const trim = TRIM_KEYS[code]
    if (trim) {
      // The radio's own trims fly the plane; the sim's would add to them.
      if (!this.radioIsTransmitter) this.events.trim?.(...trim)
      return
    }
    switch (code) {
      case 'KeyF':
        this.pressSwitch('flaps')
        break
      case 'KeyE':
        this.pressSwitch('rates')
        break
      case 'KeyH':
        this.pressSwitch('throttleHold')
        break
      case 'KeyR':
        this.pressSwitch('reset')
        break
      case 'KeyT':
        this.events.airStart?.()
        break
      case 'KeyY':
        this.events.handLaunch?.()
        break
      case 'KeyC':
        this.pressSwitch('camera')
        break
      case 'KeyP':
        this.events.pause?.()
        break
      case 'KeyG':
        this.events.debug?.()
        break
      case 'KeyQ':
        this.walking = !this.walking
        this.events.walkMode?.(this.walking)
        break
      case 'KeyB':
        this.events.pilotStation?.()
        break
    }
  }

  /** Flips a transmitter switch, or fires a reset or camera action. */
  pressSwitch(action: SwitchAction): void {
    const s = this.state
    if (action === 'flaps') s.flapSwitch = ((s.flapSwitch + 1) % 3) as 0 | 1 | 2
    else if (action === 'rates') s.highRates = !s.highRates
    else if (action === 'throttleHold') s.throttleHold = !s.throttleHold
    else if (action === 'reset') this.events.reset?.()
    else if (action === 'camera') this.events.camera?.()
  }
}

const clampTravel = (v: number) => Math.max(-1, Math.min(1, v))
const centredSticks = (): Record<Gimbal, number> => ({ leftX: 0, leftY: 0, rightX: 0, rightY: 0 })

/** Where a switch on an axis sits: 0 or 1 for two positions, 0..2 for three. */
function switchPosition(v: number, positions: 2 | 3): number {
  if (positions === 2) return v > 0 ? 1 : 0
  return v < -1 / 3 ? 0 : v > 1 / 3 ? 2 : 1
}

export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')
}
