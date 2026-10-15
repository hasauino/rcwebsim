import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { ControlInputs, Telemetry } from '../sim/simulation'
import type { TransmitterState } from '../input/transmitter'
import type { InputSource } from '../input/devices'

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
  const rawAxes = shallowRef<number[]>([])
  const rawButtons = shallowRef<boolean[]>([])
  const lastInput = ref<InputSource | null>(null)
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
    rawAxes,
    rawButtons,
    lastInput,
    history,
  }
})
