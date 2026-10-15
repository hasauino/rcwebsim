import { describe, expect, it } from 'vitest'
import { InputDevices, defaultGamepadProfile } from './devices'
import { MODE_LAYOUT, type StickMode, type TransmitterState } from './transmitter'

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
function transmitter(mode: StickMode) {
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
    (pad) => defaultGamepadProfile(pad, mode),
    {},
  )
  return { state, devices }
}

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
