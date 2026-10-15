import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { ControlInputs, Telemetry } from '../sim/simulation'
import type { TransmitterState } from '../input/transmitter'
import type { InputSource, SwitchAction } from '../input/devices'
import type { RadioSetupView } from '../input/radio-setup'

export interface HistoryPoint {
  t: number
  airspeed: number
  alpha: number
  altitude: number
  load: number
}

/** Live flight state mirrored into Vue at a UI-friendly rate (~15 Hz). */
export const useFlight = defineStore('flight', () => {
  const telemetry = shallowRef<Telemetry | null>(null)
  const channels = shallowRef<ControlInputs | null>(null)
  const transmitter = shallowRef<TransmitterState | null>(null)
  const status = ref<'loading' | 'running' | 'paused' | 'error'>('loading')
  const loadingStep = ref('Physics')
  const error = ref<string | null>(null)
  const modelMissing = ref(false)
  const renderer = ref<string>('')
  const activePad = ref<string | null>(null)
  /** Every connected gamepad's id. */
  const pads = shallowRef<string[]>([])
  /** A radio's own channels fly the plane; the sim transmitter is bypassed. */
  const radioIsTransmitter = ref(false)
  /** The radio flying the plane has gone and the receiver has failed safe. */
  const failsafe = ref(false)
  /** A switch action waiting for a switch to be flipped or a button pressed. */
  const learning = ref<SwitchAction | null>(null)
  /** The radio setup in progress, if any. */
  const setup = shallowRef<RadioSetupView | null>(null)
  const rawAxes = shallowRef<number[]>([])
  const rawButtons = shallowRef<boolean[]>([])
  const lastInput = ref<InputSource | null>(null)
  /** Walk mode: the keyboard walks the pilot round the field. */
  const walking = ref(false)
  /** Rolling history for the debug graphs. */
  const history = shallowRef<HistoryPoint[]>([])

  return {
    telemetry,
    channels,
    transmitter,
    status,
    loadingStep,
    error,
    modelMissing,
    renderer,
    activePad,
    pads,
    radioIsTransmitter,
    failsafe,
    setup,
    learning,
    rawAxes,
    rawButtons,
    lastInput,
    walking,
    history,
  }
})
