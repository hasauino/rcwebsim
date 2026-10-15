import { Vector3 } from 'three'

const SPEED_OF_SOUND = 343
/** 14-pole outrunner: electrical frequency = 7 x mechanical. */
const POLE_PAIRS = 7

const toPlane = new Vector3()

/**
 * Synthesised motor and prop sound: blade-pass buzz plus motor whine and a
 * band of prop-wash noise, pitch-shifted by Doppler and attenuated with
 * distance from the listener (the camera).
 */
export class MotorSound {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private pan!: StereoPannerNode
  private bladeOsc!: OscillatorNode
  private whineOsc!: OscillatorNode
  private bladeGain!: GainNode
  private whineGain!: GainNode
  private noiseGain!: GainNode
  private noiseFilter!: BiquadFilterNode
  private lastDistance: number | null = null
  volume = 0.6

  /** Browsers only allow audio after a user gesture; call from one. */
  start(): void {
    if (this.ctx) {
      void this.ctx.resume()
      return
    }
    const ctx = new AudioContext()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.pan = ctx.createStereoPanner()
    this.master.connect(this.pan).connect(ctx.destination)

    this.bladeOsc = ctx.createOscillator()
    this.bladeOsc.type = 'sawtooth'
    this.bladeGain = ctx.createGain()
    const bladeFilter = ctx.createBiquadFilter()
    bladeFilter.type = 'lowpass'
    bladeFilter.frequency.value = 1800
    this.bladeOsc.connect(bladeFilter).connect(this.bladeGain).connect(this.master)

    this.whineOsc = ctx.createOscillator()
    this.whineOsc.type = 'triangle'
    this.whineGain = ctx.createGain()
    this.whineOsc.connect(this.whineGain).connect(this.master)

    const noise = ctx.createBufferSource()
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    noise.buffer = buffer
    noise.loop = true
    this.noiseFilter = ctx.createBiquadFilter()
    this.noiseFilter.type = 'bandpass'
    this.noiseFilter.Q.value = 0.8
    this.noiseGain = ctx.createGain()
    noise.connect(this.noiseFilter).connect(this.noiseGain).connect(this.master)

    this.bladeOsc.start()
    this.whineOsc.start()
    noise.start()
  }

  update(
    dt: number,
    rpm: number,
    current: number,
    planePosition: Vector3,
    listener: { position: Vector3; right: Vector3 },
    paused: boolean,
  ): void {
    const ctx = this.ctx
    if (!ctx) return
    const now = ctx.currentTime
    toPlane.subVectors(planePosition, listener.position)
    const distance = Math.max(toPlane.length(), 1)

    // Doppler from the rate the distance is changing.
    const closing =
      this.lastDistance === null ? 0 : (this.lastDistance - distance) / Math.max(dt, 1e-3)
    this.lastDistance = distance
    const doppler = SPEED_OF_SOUND / (SPEED_OF_SOUND - Math.max(-60, Math.min(60, closing)))

    const rev = (rpm / 60) * doppler
    const load = Math.min(1, current / 45)
    const spinning = Math.min(1, rpm / 1500)
    this.bladeOsc.frequency.setTargetAtTime(Math.max(rev * 2, 1), now, 0.03)
    this.whineOsc.frequency.setTargetAtTime(Math.max(rev * POLE_PAIRS, 1), now, 0.03)
    this.noiseFilter.frequency.setTargetAtTime(400 + rev * 6, now, 0.05)
    this.bladeGain.gain.setTargetAtTime(0.35 * spinning, now, 0.05)
    this.whineGain.gain.setTargetAtTime(0.05 * load * spinning, now, 0.05)
    this.noiseGain.gain.setTargetAtTime(0.25 * spinning, now, 0.05)

    const attenuation = Math.min(1, 8 / distance)
    const level = paused ? 0 : this.volume * attenuation * (0.25 + 0.75 * Math.min(1, rpm / 9000))
    this.master.gain.setTargetAtTime(level, now, 0.05)
    this.pan.pan.setTargetAtTime(
      Math.max(-1, Math.min(1, toPlane.dot(listener.right) / distance)),
      now,
      0.05,
    )
  }

  dispose(): void {
    void this.ctx?.close()
    this.ctx = null
  }
}
