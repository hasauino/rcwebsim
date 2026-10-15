import { afterEach, describe, expect, it, vi } from 'vitest'
import { InputDevices, type DeviceProfile, type InputEvents } from './devices'
import {
  MODE_LAYOUT,
  defaultTransmitter,
  type StickMode,
  type TransmitterSettings,
  type TransmitterState,
} from './transmitter'

const FRAME = 1 / 60

/** Stands in for the window, dispatching just the event fields the devices read. */
function fakeWindow(devices: InputDevices) {
  const target = new EventTarget()
  devices.attach(target as unknown as Window)
  const send = (type: string, fields: object) =>
    target.dispatchEvent(Object.assign(new Event(type), fields))
  return {
    keyDown: (code: string) => send('keydown', { code }),
    keyUp: (code: string) => send('keyup', { code }),
    pointerDown: (pointerType: string) => send('pointerdown', { pointerType }),
  }
}

/** A transmitter at rest: sticks centred, throttle at idle. */
function transmitter(
  mode: StickMode,
  events: InputEvents = {},
  profiles: Record<string, DeviceProfile> = {},
) {
  const state: TransmitterState = {
    sticks: { leftX: 0, leftY: 0, rightX: 0, rightY: 0 },
    highRates: true,
    flapSwitch: 0,
    throttleHold: false,
  }
  state.sticks[MODE_LAYOUT[mode].throttle] = 1
  const devices = new InputDevices(
    state,
    () => mode,
    () => profiles,
    events,
  )
  return { state, devices, profiles }
}

/** A plugged-in device whose axes and buttons the test moves. */
interface FakePad {
  id: string
  connected: boolean
  mapping: string
  axes: number[]
  buttons: { pressed: boolean }[]
}

function fakePad(id: string, axes: number[], mapping = ''): FakePad {
  return { id, connected: true, mapping, axes: [...axes], buttons: [] }
}

/** Plugs `pads` in; the list can be changed later to unplug or add devices. */
function plugIn(...pads: FakePad[]) {
  const connected = [...pads]
  vi.stubGlobal('navigator', { getGamepads: () => connected })
  return connected
}

/**
 * A USB sim cable on a 6-channel radio, set up: channels in AETR order
 * then flaps on axis 4, all scaled to full range with no deadband.
 */
function radioProfile(receiverOnly = true): DeviceProfile {
  const axis = (index: number) => ({ index, invert: false, min: -1, center: 0, max: 1 })
  return {
    kind: 'radio',
    channels: {
      aileron: axis(0),
      elevator: axis(1),
      throttle: axis(2),
      rudder: axis(3),
      flap: axis(4),
    },
    receiverOnly,
    deadzone: 0,
    switches: {},
  }
}

/** A sim transmitter set up to change everything it touches. */
function busyTransmitter(mode: StickMode): TransmitterSettings {
  const tx = defaultTransmitter()
  tx.mode = mode
  for (const c of Object.values(tx.channels)) {
    c.expo = 0.6
    c.trim = 0.1
    c.lowRate = 0.5
  }
  tx.flapElevatorMix = -0.3
  return tx
}

describe('USB transmitter (radio)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it("is only the receiver: the radio's channels reach the plane untouched by the sim transmitter", () => {
    const radio = fakePad('PPM', [0, 0, -1, 0, -1, 0])
    plugIn(radio)
    const { state, devices } = transmitter(1, {}, { PPM: radioProfile() })
    devices.update(FRAME)
    radio.axes = [0.4, -0.25, 0.6, 0.15, 1, 0]
    devices.update(FRAME)
    state.highRates = false

    expect(devices.channels(busyTransmitter(1))).toEqual({
      aileron: 0.4,
      elevator: -0.25,
      throttle: 0.8,
      rudder: 0.15,
      flap: 1,
    })
  })

  it('lets the sim transmitter shape the radio, whatever stick mode the sim is set to', () => {
    const fly = (mode: StickMode) => {
      const radio = fakePad('PPM', [0, 0, -1, 0])
      plugIn(radio)
      const { devices } = transmitter(mode, {}, { PPM: radioProfile(false) })
      devices.update(FRAME)
      radio.axes = [0.5, 0.4, 0, -0.3]
      devices.update(FRAME)
      return devices.channels(busyTransmitter(mode))
    }
    const mode2 = fly(2)
    expect(fly(1)).toEqual(mode2)
    // High-rate aileron with 60% expo and the sim's 10% trim: 0.6*0.125 + 0.4*0.5 + 0.1.
    expect(mode2.aileron).toBeCloseTo(0.375)
    expect(mode2.throttle).toBeCloseTo(0.5)
  })

  it('takes an unknown device for a radio sending AETR, with stick forward as down elevator', () => {
    const radio = fakePad('PPM', [0, 0, -1, 0, 0, 0])
    plugIn(radio)
    const { devices, profiles } = transmitter(2)
    devices.update(FRAME)
    radio.axes = [0.5, 0.6, 1, -0.2, 0.9, 0]
    devices.update(FRAME)

    expect(profiles.PPM?.kind).toBe('radio')
    expect(devices.channels(defaultTransmitter())).toEqual({
      aileron: 0.5,
      elevator: -0.6,
      throttle: 1,
      rudder: -0.2,
      flap: 0,
    })
  })

  it('starts a radio saved before radios had their own profile over, but keeps a gamepad’s', () => {
    const legacy = (index: number) => ({ index, invert: false, min: -1, center: 0, max: 1 })
    const old = {
      axes: { leftX: legacy(3), leftY: legacy(2), rightX: legacy(1), rightY: legacy(0) },
      throttleStyle: 'absolute',
      deadzone: 0.02,
      buttons: { reset: 4 },
    } as unknown as DeviceProfile
    const reset = vi.fn()
    const radio = fakePad('PPM', [0, 0, -1, 0])
    const pad = fakePad('Pad', [0, 0, 0, 0], 'standard')
    pad.buttons = [0, 1, 2, 3, 4].map(() => ({ pressed: false }))
    plugIn(radio, pad)
    const { devices, profiles } = transmitter(2, { reset }, { PPM: old, Pad: { ...old } })
    devices.update(FRAME)
    radio.axes = [0.5, 0, -1, 0]
    devices.update(FRAME)
    expect(devices.channels(defaultTransmitter()).aileron).toBe(0.5)

    pad.buttons[4]!.pressed = true
    devices.update(FRAME)
    expect(profiles.Pad).toMatchObject({ kind: 'gamepad', axes: { rightY: { index: 0 } } })
    expect(reset).toHaveBeenCalledOnce()
  })

  it('follows radio switches on axes: the switch position is the switch state', () => {
    const reset = vi.fn()
    const profile = radioProfile(false)
    profile.switches = {
      flaps: { axis: 4, positions: 3, invert: false },
      throttleHold: { axis: 5, positions: 2, invert: true },
      reset: { axis: 6, positions: 2, invert: false },
    }
    const radio = fakePad('PPM', [0, 0, -1, 0, -1, 1, -1])
    plugIn(radio)
    const { state, devices } = transmitter(2, { reset }, { PPM: profile })
    const win = fakeWindow(devices)
    devices.update(FRAME)
    radio.axes = [0.5, 0, -1, 0, 0.05, -1, -1]
    devices.update(FRAME)
    expect(state.flapSwitch).toBe(1)
    expect(state.throttleHold).toBe(true)

    // A key can't flip a switch the radio holds.
    win.keyDown('KeyF')
    devices.update(FRAME)
    expect(state.flapSwitch).toBe(1)

    radio.axes = [0.5, 0, -1, 0, 0.9, 1, 1]
    devices.update(FRAME)
    devices.update(FRAME)
    expect(state.flapSwitch).toBe(2)
    expect(state.throttleHold).toBe(false)
    expect(reset).toHaveBeenCalledOnce()
  })

  it('binds a switch to the next radio switch flipped, not a stick, or the next button pressed', () => {
    const radio = fakePad('PPM', [0, 0, -1, 0, -1, 1, 1])
    radio.buttons = [{ pressed: false }, { pressed: false }]
    plugIn(radio)
    const { devices, profiles } = transmitter(2, {}, { PPM: radioProfile(false) })
    devices.update(FRAME)

    devices.learnSwitch('throttleHold', 2)
    expect(devices.learning).toBe('throttleHold')
    radio.axes = [0.9, 0, -1, 0, -1, 1, 1]
    devices.update(FRAME)
    expect(devices.learning).toBe('throttleHold')
    // Flipped on, the switch reads negative: that end is "on".
    radio.axes = [0, 0, -1, 0, -1, -1, 1]
    devices.update(FRAME)
    expect(devices.learning).toBeNull()
    expect(profiles.PPM?.switches.throttleHold).toEqual({ axis: 5, positions: 2, invert: true })

    devices.learnSwitch('camera', 2)
    radio.buttons[1]!.pressed = true
    devices.update(FRAME)
    expect(profiles.PPM?.switches.camera).toEqual({ button: 1 })
  })

  it('binds a three-position switch by its end position, not the middle it passes', () => {
    const radio = fakePad('PPM', [0, 0, -1, 0, -1, 1])
    plugIn(radio)
    const { devices, profiles } = transmitter(2, {}, { PPM: radioProfile(false) })
    devices.update(FRAME)
    devices.learnSwitch('flaps', 3)
    for (const v of [0, -1]) {
      radio.axes[5] = v
      devices.update(FRAME)
    }
    expect(profiles.PPM?.switches.flaps).toEqual({ axis: 5, positions: 3, invert: true })
  })

  it("lowers the flaps from the radio's flap channel when the sim shapes the sticks", () => {
    const radio = fakePad('PPM', [0, 0, -1, 0, -1])
    plugIn(radio)
    const { state, devices } = transmitter(2, {}, { PPM: radioProfile(false) })
    devices.update(FRAME)
    radio.axes = [0.5, 0, -1, 0, 0.02]
    devices.update(FRAME)
    expect(state.flapSwitch).toBe(1)
    expect(devices.channels(defaultTransmitter()).flap).toBe(0.5)
  })

  it('ignores the sim trim keys while the radio is the transmitter', () => {
    const trim = vi.fn()
    const radio = fakePad('PPM', [0, 0, -1, 0])
    plugIn(radio)
    const { devices } = transmitter(2, { trim }, { PPM: radioProfile() })
    const win = fakeWindow(devices)
    win.keyDown('KeyI')
    expect(trim).toHaveBeenCalledOnce()

    devices.update(FRAME)
    radio.axes = [0.5, 0, -1, 0]
    devices.update(FRAME)
    expect(devices.radioIsTransmitter).toBe(true)
    win.keyDown('KeyK')
    expect(trim).toHaveBeenCalledOnce()
  })

  it('flies with the device moved last, unless one is pinned', () => {
    const radio = fakePad('PPM', [0, 0, -1, 0])
    const phantom = fakePad('Phantom', [1.29, 0, 0, 0])
    const pad = fakePad('Pad', [0, 0, 0, 0], 'standard')
    plugIn(phantom, radio, pad)
    const { state, devices } = transmitter(2, {}, { PPM: radioProfile() })
    devices.update(FRAME)
    radio.axes = [0.5, 0, -1, 0]
    devices.update(FRAME)
    expect(devices.pads).toEqual(['Phantom', 'PPM', 'Pad'])
    expect(devices.activePad).toBe('PPM')

    pad.axes = [0, 0, -0.6, 0]
    devices.update(FRAME)
    expect(devices.activePad).toBe('Pad')
    expect(devices.radioIsTransmitter).toBe(false)
    expect(state.sticks.rightX).toBeCloseTo(-0.6)

    devices.pinnedPad = 'PPM'
    devices.update(FRAME)
    expect(devices.activePad).toBe('PPM')
    expect(devices.channels(defaultTransmitter()).aileron).toBe(0.5)
  })

  it('stays in failsafe when another device was used earlier, until one is moved again', () => {
    const radio = fakePad('PPM', [0, 0, -1, 0])
    const pad = fakePad('Pad', [0, 0, 0, 0], 'standard')
    const connected = plugIn(pad, radio)
    const { devices } = transmitter(2, {}, { PPM: radioProfile() })
    devices.update(FRAME)
    pad.axes = [0, 0, 0.6, 0]
    devices.update(FRAME)
    pad.axes = [0, 0, 0, 0]
    radio.axes = [0.5, 0, 0.2, 0]
    devices.update(FRAME)
    expect(devices.radioIsTransmitter).toBe(true)

    connected.splice(1, 1)
    devices.update(FRAME)
    devices.update(FRAME)
    expect(devices.failsafe).toBe(true)
    pad.axes = [0, 0, 0.6, 0]
    devices.update(FRAME)
    expect(devices.failsafe).toBe(false)
  })

  it('takes a button held down as one move, so a held button cannot keep stealing control', () => {
    const radio = fakePad('PPM', [0, 0, -1, 0])
    const pad = fakePad('Pad', [0, 0, 0, 0], 'standard')
    pad.buttons = [{ pressed: false }]
    plugIn(pad, radio)
    const { devices } = transmitter(2, {}, { PPM: radioProfile() })
    devices.update(FRAME)
    pad.buttons[0]!.pressed = true
    devices.update(FRAME)
    expect(devices.activePad).toBe('Pad')
    radio.axes = [0.5, 0, -1, 0]
    devices.update(FRAME)
    devices.update(FRAME)
    expect(devices.activePad).toBe('PPM')
  })

  it('says the sim transmitter still shapes the sticks in failsafe when it was doing so', () => {
    const radio = fakePad('PPM', [0, 0, -1, 0])
    const connected = plugIn(radio)
    const { devices } = transmitter(2, {}, { PPM: radioProfile(false) })
    devices.update(FRAME)
    radio.axes = [0.5, 0, -1, 0]
    devices.update(FRAME)
    connected.length = 0
    devices.update(FRAME)
    expect(devices.failsafe).toBe(true)
    expect(devices.radioIsTransmitter).toBe(false)
  })

  it('fails safe when the radio goes mid-flight: throttle cut, surfaces held', () => {
    const radio = fakePad('PPM', [0, 0, -1, 0])
    const connected = plugIn(radio)
    const { devices } = transmitter(2, {}, { PPM: radioProfile() })
    const win = fakeWindow(devices)
    devices.update(FRAME)
    radio.axes = [0.3, -0.2, 0.6, 0.1]
    devices.update(FRAME)
    devices.channels(defaultTransmitter())

    connected.length = 0
    devices.update(FRAME)
    expect(devices.failsafe).toBe(true)
    expect(devices.channels(defaultTransmitter())).toEqual({
      aileron: 0.3,
      elevator: -0.2,
      throttle: 0,
      rudder: 0.1,
      flap: 0,
    })

    // Back on, the radio flies again once it is moved.
    connected.push(radio)
    devices.update(FRAME)
    radio.axes = [0, 0, -1, 0]
    devices.update(FRAME)
    expect(devices.failsafe).toBe(false)

    // Taking over on the keyboard also ends it.
    connected.length = 0
    devices.update(FRAME)
    expect(devices.failsafe).toBe(true)
    win.keyDown('ArrowLeft')
    devices.update(FRAME)
    expect(devices.failsafe).toBe(false)
  })
})

describe('touch sticks', () => {
  it('moves the gimbals by finger travel from where the finger landed', () => {
    const { state, devices } = transmitter(2)
    devices.touchDown('right')
    devices.touchMove('right', 0.5, -0.3)
    devices.update(FRAME)
    expect(state.sticks.rightX).toBeCloseTo(0.5)
    expect(state.sticks.rightY).toBeCloseTo(-0.3)
  })

  it('springs a centring stick back to centre when the finger lifts', () => {
    const { state, devices } = transmitter(2)
    devices.touchDown('right')
    devices.touchMove('right', 0.8, 0.6)
    devices.update(FRAME)
    devices.touchUp('right')
    devices.update(FRAME)
    expect(state.sticks.rightX).toBe(0)
    expect(state.sticks.rightY).toBe(0)
  })

  it('holds the throttle stick where the finger left it, and moves it on from there', () => {
    const { state, devices } = transmitter(2)
    // Mode 2: throttle is the left stick's vertical gimbal, starting at idle.
    devices.update(FRAME)
    expect(state.sticks.leftY).toBe(1)

    devices.touchDown('left')
    devices.touchMove('left', 0.4, -1)
    devices.update(FRAME)
    expect(state.sticks.leftY).toBeCloseTo(0)
    expect(state.sticks.leftX).toBeCloseTo(0.4)

    devices.touchUp('left')
    devices.update(FRAME)
    expect(state.sticks.leftY).toBeCloseTo(0)
    expect(state.sticks.leftX).toBe(0)

    devices.touchDown('left')
    devices.touchMove('left', 0, -1)
    devices.update(FRAME)
    expect(state.sticks.leftY).toBeCloseTo(-1)
  })

  it('follows the stick mode: Mode 1 puts throttle on the right stick', () => {
    const { state, devices } = transmitter(1)
    devices.touchDown('right')
    devices.touchMove('right', 0, -1)
    devices.touchDown('left')
    devices.touchMove('left', 0, 0.5)
    devices.update(FRAME)
    devices.touchUp('right')
    devices.touchUp('left')
    devices.update(FRAME)
    expect(state.sticks.rightY).toBeCloseTo(0)
    expect(state.sticks.leftY).toBe(0)
  })

  it('centres the other pad while one finger flies', () => {
    const { state, devices } = transmitter(2)
    devices.touchDown('right')
    devices.touchMove('right', 1, 1)
    devices.update(FRAME)
    devices.touchDown('left')
    devices.touchUp('right')
    devices.update(FRAME)
    expect(state.sticks.rightX).toBe(0)
    expect(state.sticks.rightY).toBe(0)
    expect(state.sticks.leftY).toBe(1)
  })

  it('limits travel to full throw', () => {
    const { state, devices } = transmitter(2)
    devices.touchDown('right')
    devices.touchMove('right', -3, 2)
    devices.touchDown('left')
    devices.touchMove('left', 0, -5)
    devices.update(FRAME)
    expect(state.sticks.rightX).toBe(-1)
    expect(state.sticks.rightY).toBe(1)
    expect(state.sticks.leftY).toBe(-1)
  })

  it('flies on touch over held keys, and reports the device last used', () => {
    const { state, devices } = transmitter(2)
    const win = fakeWindow(devices)
    expect(devices.lastInput).toBeNull()

    win.keyDown('ArrowRight')
    expect(devices.lastInput).toBe('keyboard')

    devices.touchDown('right')
    devices.touchMove('right', -0.5, 0)
    devices.update(FRAME)
    expect(devices.lastInput).toBe('touch')
    expect(state.sticks.rightX).toBeCloseTo(-0.5)

    devices.touchUp('right')
    win.keyUp('ArrowRight')
    win.keyDown('KeyW')
    expect(devices.lastInput).toBe('keyboard')
  })

  it('counts a touch anywhere on screen as touch input, but not a mouse click', () => {
    const { devices } = transmitter(2)
    const win = fakeWindow(devices)
    win.pointerDown('mouse')
    expect(devices.lastInput).toBeNull()
    win.pointerDown('touch')
    expect(devices.lastInput).toBe('touch')
  })

  it('flips the transmitter switches from on-screen buttons', () => {
    const { state, devices } = transmitter(2)
    devices.pressSwitch('flaps')
    devices.pressSwitch('flaps')
    devices.pressSwitch('rates')
    devices.pressSwitch('throttleHold')
    expect(state.flapSwitch).toBe(2)
    expect(state.highRates).toBe(false)
    expect(state.throttleHold).toBe(true)
  })

  it('lets a reset set the throttle under a held thumb', () => {
    const { state, devices } = transmitter(2)
    devices.touchDown('left')
    devices.touchMove('left', 0, -2)
    devices.update(FRAME)
    expect(state.sticks.leftY).toBeCloseTo(-1)

    // An air start sets circuit power (half throttle) while the thumb stays put.
    devices.setThrottle(0.5)
    devices.update(FRAME)
    expect(state.sticks.leftY).toBeCloseTo(0)

    devices.touchMove('left', 0, -2.5)
    devices.update(FRAME)
    expect(state.sticks.leftY).toBeCloseTo(-0.5)
  })
})

describe('walk mode', () => {
  it('walks the pilot with W instead of opening the throttle once Q is pressed', () => {
    const { state, devices } = transmitter(2)
    const win = fakeWindow(devices)
    win.keyDown('KeyQ')
    expect(devices.walking).toBe(true)

    win.keyDown('KeyW')
    devices.update(1)
    expect(devices.walk.forward).toBe(1)
    expect(state.sticks.leftY).toBe(1)
  })

  it('sidesteps with A and D while the arrow keys still fly', () => {
    const { state, devices } = transmitter(2)
    const win = fakeWindow(devices)
    win.keyDown('KeyQ')
    win.keyDown('KeyA')
    win.keyDown('ArrowRight')
    devices.update(1)
    expect(devices.walk.right).toBe(-1)
    // Mode 2: rudder is left stick horizontal, aileron right stick horizontal.
    expect(state.sticks.leftX).toBe(0)
    expect(state.sticks.rightX).toBe(1)
  })

  it('keeps flying on a gamepad while the keyboard walks', () => {
    const pad = {
      id: 'pad',
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: [],
    } as unknown as Gamepad
    vi.stubGlobal('navigator', { getGamepads: () => [pad] })
    const { state, devices } = transmitter(2)
    const win = fakeWindow(devices)
    devices.update(FRAME)
    ;(pad.axes as number[])[2] = 0.8
    devices.update(FRAME)
    win.keyDown('KeyQ')
    win.keyDown('KeyW')
    devices.update(FRAME)
    expect(state.sticks.rightX).toBeCloseTo(0.8)
    expect(devices.walk.forward).toBe(1)
  })

  it('runs while Shift is held', () => {
    const { devices } = transmitter(2)
    const win = fakeWindow(devices)
    win.keyDown('KeyQ')
    win.keyDown('KeyW')
    devices.update(FRAME)
    expect(devices.walk.running).toBe(false)
    win.keyDown('ShiftLeft')
    devices.update(FRAME)
    expect(devices.walk.running).toBe(true)
  })

  it('keeps full stick travel on the arrow keys while running', () => {
    const { state, devices } = transmitter(2)
    const win = fakeWindow(devices)
    win.keyDown('KeyQ')
    win.keyDown('ShiftLeft')
    win.keyDown('ArrowRight')
    devices.update(1)
    expect(state.sticks.rightX).toBe(1)
  })

  it('tells the app when walk mode starts and stops', () => {
    const walkMode = vi.fn()
    const { devices } = transmitter(2, { walkMode })
    const win = fakeWindow(devices)
    win.keyDown('KeyQ')
    win.keyUp('KeyQ')
    win.keyDown('KeyQ')
    expect(walkMode.mock.calls).toEqual([[true], [false]])
    expect(devices.walking).toBe(false)
  })

  it('sends the pilot back to the pilot station with B', () => {
    const pilotStation = vi.fn()
    const { devices } = transmitter(2, { pilotStation })
    fakeWindow(devices).keyDown('KeyB')
    expect(pilotStation).toHaveBeenCalledOnce()
  })

  afterEach(() => vi.unstubAllGlobals())
})

describe('radio setup', () => {
  afterEach(() => vi.unstubAllGlobals())

  /**
   * A sim cable that puts the radio's channels on axes out of order: elevator
   * on 0 (forward positive), rudder 1, aileron 2, flap 3, a knob 4, throttle 5.
   * Full stick travel reads ±0.9.
   */
  function oddCable() {
    const rest = [0, 0, 0, -0.9, 0.2, -0.9]
    const radio = fakePad('PPM', rest)
    plugIn(radio)
    const { devices, profiles } = transmitter(2)
    devices.update(FRAME)
    const set = (axes: Record<number, number>) => {
      radio.axes = rest.map((v, i) => axes[i] ?? v)
      devices.update(FRAME)
    }
    return { devices, profiles, set }
  }

  /** Walks the setup through to the end, sticks centred and still throughout the check. */
  function runSetup(cable: ReturnType<typeof oddCable>) {
    const { devices, set } = cable
    const setup = devices.startRadioSetup()!
    expect(setup.view().step).toBe('centre')
    setup.next()
    set({ 2: 0.9 })
    set({})
    expect(setup.view().step).toBe('elevator')
    set({ 0: -0.9 })
    set({})
    set({ 1: 0.9 })
    set({})
    set({ 5: 0.9 })
    set({})
    expect(setup.view().step).toBe('flap')
    set({ 3: 0.9 })
    expect(setup.view().step).toBe('sweep')
    for (const v of [0.9, -0.9]) set({ 0: v, 1: v, 2: v, 3: v, 4: v, 5: v })
    set({})
    setup.next()
    expect(setup.view().step).toBe('still')
    for (let i = 0; i < 90; i++) set({})
    return setup
  }

  it("finds each channel's axis and direction by moving it, and keeps the radio's trims", () => {
    const cable = oddCable()
    const setup = runSetup(cable)
    expect(setup.view().step).toBe('done')
    expect(cable.profiles.PPM).toMatchObject({
      kind: 'radio',
      channels: {
        aileron: { index: 2, invert: false },
        elevator: { index: 0, invert: true },
        rudder: { index: 1, invert: false },
        throttle: { index: 5, invert: false },
        flap: { index: 3, invert: false },
      },
    })

    setup.close()
    expect(cable.devices.setup).toBeNull()

    // Fly: a trim click on the aileron reaches the plane rather than being cancelled by the setup.
    cable.set({ 2: 0.045, 0: -0.45, 5: 0, 3: 0 })
    const out = cable.devices.channels(defaultTransmitter())
    expect(out.aileron).toBeCloseTo(0.05)
    expect(out.elevator).toBeCloseTo(0.5)
    expect(out.throttle).toBeCloseTo(0.5)
    expect(out.flap).toBeCloseTo(0.5)
  })

  it('waits until the radio holds still, then reports a channel resting off centre', () => {
    // A jittery cable: the check never finishes while the sticks shake.
    const cable = oddCable()
    const shaky = cable.devices.startRadioSetup()!
    shaky.next()
    for (const [axis, v] of [
      [2, 0.9],
      [0, -0.9],
      [1, 0.9],
      [5, 0.9],
      [3, 0.9],
    ] as const) {
      cable.set({ [axis]: v })
      cable.set({})
    }
    for (const v of [0.9, -0.9]) cable.set({ 0: v, 1: v, 2: v, 3: v, 4: v, 5: v })
    shaky.next()
    for (let i = 0; i < 120; i++) cable.set({ 2: i % 2 ? 0.05 : -0.05 })
    expect(shaky.view()).toMatchObject({ step: 'still', steady: false })

    // Settled, with the elevator trimmed 10% up (pulled back): flagged, but kept.
    for (let i = 0; i < 90; i++) cable.set({ 0: -0.09, 2: i % 2 ? 0.002 : -0.002 })
    expect(shaky.view().step).toBe('done')
    expect(shaky.view().offCentre).toEqual([{ channel: 'elevator', value: expect.closeTo(0.1) }])
    const profile = cable.profiles.PPM as Extract<DeviceProfile, { kind: 'radio' }>
    expect(profile.channels.aileron.deadzone).toBeGreaterThan(0)
    expect(profile.channels.aileron.deadzone).toBeLessThan(0.01)
  })

  it('leaves the flap channel unassigned when skipped', () => {
    const { devices, profiles, set } = oddCable()
    const setup = devices.startRadioSetup()!
    setup.next()
    for (const [axis, v] of [
      [2, 0.9],
      [0, -0.9],
      [1, 0.9],
      [5, 0.9],
    ] as const) {
      set({ [axis]: v })
      set({})
    }
    setup.skip()
    expect(setup.view().step).toBe('sweep')
    for (const v of [0.9, -0.9]) set({ 0: v, 1: v, 2: v, 5: v })
    setup.next()
    for (let i = 0; i < 90; i++) set({})
    expect(profiles.PPM).toMatchObject({ channels: { flap: { index: -1 } } })
  })

  it('can be cancelled, leaving the profile as it was', () => {
    const { devices, profiles, set } = oddCable()
    const before = JSON.parse(JSON.stringify(profiles))
    const setup = devices.startRadioSetup()!
    setup.next()
    set({ 2: 0.9 })
    setup.close()
    expect(devices.setup).toBeNull()
    expect(profiles).toEqual(before)
  })
})
