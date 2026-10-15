import { defineStore } from 'pinia'
import { reactive, watch } from 'vue'
import { defaultTransmitter, type LowRates, type TransmitterSettings } from '../input/transmitter'
import type { GamepadProfile } from '../input/devices'
import { DEFAULT_WIND, type WindSettings } from '../sim/simulation'
import type { CameraMode } from '../render/cameras'
import type { Quality } from '../render/world'

export interface Settings {
  /** Transmitter model memory, per aircraft id. */
  transmitters: Record<string, TransmitterSettings>
  /** Axis/button mapping per gamepad id. */
  gamepads: Record<string, GamepadProfile>
  wind: WindSettings
  camera: { mode: CameraMode; autoZoom: boolean; fov: number }
  graphics: { quality: Quality; shadows: boolean; grass: boolean }
  debug: { overlay: boolean; graphs: boolean }
  audio: { volume: number }
}

const STORAGE_KEY = 'rcfsim.settings.v1'

function defaults(): Settings {
  return {
    transmitters: {},
    gamepads: {},
    wind: { ...DEFAULT_WIND },
    camera: { mode: 'pilot', autoZoom: true, fov: 50 },
    graphics: { quality: 'medium', shadows: true, grass: true },
    debug: { overlay: false, graphs: false },
    audio: { volume: 0.6 },
  }
}

function load(): Settings {
  const base = defaults()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const saved = JSON.parse(raw) as Partial<Settings>
    return {
      ...base,
      ...saved,
      wind: { ...base.wind, ...saved.wind },
      camera: { ...base.camera, ...saved.camera },
      graphics: { ...base.graphics, ...saved.graphics },
      debug: { ...base.debug, ...saved.debug },
      audio: { ...base.audio, ...saved.audio },
    }
  } catch {
    return base
  }
}

export const useSettings = defineStore('settings', () => {
  const settings = reactive(load())

  watch(
    settings,
    (value) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
      } catch {
        // Storage unavailable (private mode etc.): settings last for the session.
      }
    },
    { deep: true },
  )

  function transmitterFor(aircraftId: string, lowRates: LowRates) {
    settings.transmitters[aircraftId] ??= defaultTransmitter(lowRates)
    return settings.transmitters[aircraftId]!
  }

  function reset() {
    Object.assign(settings, defaults())
  }

  return { settings, transmitterFor, reset }
})
