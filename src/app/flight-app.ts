import { Quaternion, Vector3 } from 'three'
import { MotorSound } from '../audio/motor'
import { InputDevices, defaultGamepadProfile, type GamepadProfile } from '../input/devices'
import { mixChannels, neutralSticks, type TransmitterSettings } from '../input/transmitter'
import { pa18 } from '../sim/aircraft/pa18'
import { FlightRecorder, type FlightRecording } from '../sim/recording'
import {
  createSimulation,
  type ControlInputs,
  type Simulation,
  type Spawn,
  type Telemetry,
} from '../sim/simulation'
import type { useFlight } from '../stores/flight'
import type { Settings } from '../stores/settings'
import { World3D } from '../render/world'
import { FixedStepRunner } from './runner'

type FlightStore = ReturnType<typeof useFlight>

/** How often the Vue UI is refreshed from the sim, s. */
const UI_INTERVAL = 1 / 15
const HISTORY_SECONDS = 20

const position = new Vector3()
const quaternion = new Quaternion()

/**
 * Wires everything together: input devices -> virtual transmitter -> fixed
 * step simulation -> renderer + audio, and mirrors state into Vue stores.
 */
export class FlightApp {
  readonly aircraft = pa18
  sim!: Simulation
  world!: World3D
  private runner!: FixedStepRunner
  private devices!: InputDevices
  private recorder!: FlightRecorder
  private readonly sound = new MotorSound()
  private readonly transmitterState = neutralSticks()
  private paused = false
  private lastFrame = 0
  private uiTimer = 0
  private spawn: Spawn = { kind: 'runway' }
  private seed = 1
  private detach: (() => void) | null = null
  private disposed = false
  private readonly unlockAudio = () => this.sound.start()
  private resizeObserver: ResizeObserver | null = null
  private channels: ControlInputs = { aileron: 0, elevator: 0, rudder: 0, throttle: 0, flap: 0 }
  private telemetry: Telemetry | null = null

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly settings: Settings,
    private readonly flight: FlightStore,
    private readonly transmitter: () => TransmitterSettings,
  ) {}

  async start(): Promise<void> {
    this.seed = Math.floor(Math.random() * 2 ** 31)
    this.sim = await createSimulation({
      aircraft: this.aircraft,
      wind: { ...this.settings.wind },
      seed: this.seed,
    })
    if (this.disposed) return this.sim.dispose()
    this.runner = new FixedStepRunner(this.sim)
    this.newRecording()

    this.world = new World3D(this.canvas, this.aircraft, this.sim)
    const found = await this.world.init(this.settings.graphics.quality, (label) => {
      this.flight.loadingStep = label
    })
    if (this.disposed) return this.world.dispose()
    this.flight.modelMissing = !found
    this.flight.renderer = this.world.usingWebGPU ? 'WebGPU' : 'WebGL 2'

    this.devices = new InputDevices(
      this.transmitterState,
      () => this.transmitter().mode,
      (pad) => this.gamepadProfile(pad),
      {
        reset: () => this.reset({ kind: 'runway' }),
        airStart: () => this.reset({ kind: 'air' }),
        camera: () => this.cycleCamera(),
        pause: () => this.togglePause(),
        debug: () => (this.settings.debug.overlay = !this.settings.debug.overlay),
        trim: (channel, step) => {
          const c = this.transmitter().channels[channel]
          c.trim = Math.max(-0.25, Math.min(0.25, c.trim + step))
        },
      },
    )
    this.detach = this.devices.attach(window)
    window.addEventListener('pointerdown', this.unlockAudio)
    window.addEventListener('keydown', this.unlockAudio)

    this.resizeObserver = new ResizeObserver(() => this.world.resize())
    this.resizeObserver.observe(this.canvas)

    this.flight.status = 'running'
    this.world.renderer.setAnimationLoop((time) => this.frame(time))
  }

  reset(spawn: Spawn): void {
    this.spawn = spawn
    this.sim.setWind({ ...this.settings.wind })
    this.sim.reset(spawn)
    this.runner.snap()
    this.world.cameras.snap()
    // Idle on the runway; circuit power for an air start. (A transmitter's
    // non-centring throttle stick overrides this as soon as it is read.)
    this.devices.setThrottle(spawn.kind === 'air' ? 0.5 : 0)
    if (spawn.kind === 'air') this.transmitterState.throttleHold = false
    this.newRecording()
  }

  setWind(): void {
    const wind = { ...this.settings.wind }
    this.sim.setWind(wind)
    this.recorder.setWind(wind)
  }

  togglePause(): void {
    this.paused = !this.paused
    this.flight.status = this.paused ? 'paused' : 'running'
  }

  setPaused(paused: boolean): void {
    if (this.paused !== paused) this.togglePause()
  }

  cycleCamera(): void {
    this.settings.camera.mode = this.settings.camera.mode === 'pilot' ? 'chase' : 'pilot'
  }

  /** The current flight's inputs, replayable with `replay()` from sim/recording. */
  recording(): FlightRecording {
    return this.recorder.finish()
  }

  dispose(): void {
    this.disposed = true
    window.removeEventListener('pointerdown', this.unlockAudio)
    window.removeEventListener('keydown', this.unlockAudio)
    this.detach?.()
    this.resizeObserver?.disconnect()
    this.sound.dispose()
    this.world?.dispose()
    this.sim?.dispose()
  }

  private newRecording(): void {
    this.recorder = new FlightRecorder({
      aircraft: this.aircraft,
      seed: this.seed,
      wind: { ...this.settings.wind },
      spawn: this.spawn,
    })
  }

  private gamepadProfile(pad: Gamepad): GamepadProfile {
    const saved = this.settings.gamepads[pad.id]
    if (saved) return saved
    const created = defaultGamepadProfile(pad, this.transmitter().mode)
    this.settings.gamepads[pad.id] = created
    return created
  }

  private frame(time: number): void {
    const dt = this.lastFrame ? Math.min((time - this.lastFrame) / 1000, 0.1) : 1 / 60
    this.lastFrame = time

    this.devices.update(dt)
    this.channels = mixChannels(this.transmitter(), this.transmitterState)

    let alpha = 1
    if (!this.paused) {
      alpha = this.runner.advance(dt, this.channels, (inputs) => this.recorder.record(inputs))
    }
    this.runner.pose(alpha, position, quaternion)
    const t = this.sim.telemetry()
    this.telemetry = t

    const s = this.settings
    this.world.render(dt, position, quaternion, t, {
      camera: s.camera.mode,
      autoZoom: s.camera.autoZoom,
      fov: s.camera.fov,
      debugOverlay: s.debug.overlay,
      shadows: s.graphics.shadows,
      grass: s.graphics.grass,
    })
    this.sound.volume = s.audio.volume
    this.sound.update(dt, t.rpm, t.current, position, this.world.listener(), this.paused)

    this.uiTimer += dt
    if (this.uiTimer >= UI_INTERVAL) {
      this.uiTimer = 0
      this.publish(t)
    }
  }

  private publish(t: Telemetry): void {
    const f = this.flight
    f.telemetry = t
    f.channels = { ...this.channels }
    f.transmitter = {
      ...this.transmitterState,
      sticks: { ...this.transmitterState.sticks },
    }
    f.activePad = this.devices.activePad
    f.rawAxes = this.devices.rawAxes
    f.rawButtons = this.devices.rawButtons
    const point = {
      t: this.sim.state().time,
      airspeed: t.airspeed,
      alpha: t.alphaDeg,
      altitude: t.altitude,
      load: t.loadFactor,
    }
    const history = f.history.filter((p) => p.t > point.t - HISTORY_SECONDS && p.t <= point.t)
    history.push(point)
    f.history = history
  }
}
