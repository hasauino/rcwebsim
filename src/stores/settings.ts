import { defineStore } from 'pinia'
import { reactive, watch } from 'vue'
import { defaultTransmitter, type LowRates, type TransmitterSettings } from '../input/transmitter'
import type { DeviceProfile } from '../input/devices'
import type { AircraftSpec } from '../sim/aircraft/types'
import {
  DEFAULT_WIND,
  PERFECT_BUILD,
  buildTolerances,
  type BuildTolerances,
  type WindSettings,
} from '../sim/simulation'
import type { CameraMode } from '../render/cameras'
import type { Quality } from '../render/world'

export interface Settings {
  /** Transmitter model memory, per aircraft id. */
  transmitters: Record<string, TransmitterSettings>
  /** CG per aircraft id, m behind the datum. Absent means the manual's. */
  cg: Record<string, number>
  /**
   * Rigging per aircraft id. With `needsTrimming` the airframe is built off
   * true by `seed` and has to be trimmed out; absent or off, it is perfect.
   */
  builds: Record<string, { needsTrimming: boolean; seed: number }>
  /** Axis/switch mapping per gamepad id: a gamepad's, or a radio's on a sim cable. */
  gamepads: Record<string, DeviceProfile>
  controls: {
    /** On-screen sticks: auto shows them on touch devices and after a touch. */
    touch: 'auto' | 'on' | 'off'
    /** Gamepad id to fly with; null follows whichever was moved last. */
    pad: string | null
  }
  wind: WindSettings
  camera: { mode: CameraMode; autoZoom: boolean; fov: number }
  graphics: { quality: Quality; shadows: boolean; grass: boolean }
  debug: { overlay: boolean; graphs: boolean }
  audio: { volume: number }
}

/** The aircraft's CG as set by the pilot, m behind the datum. */
export function cgFor(settings: Settings, aircraft: AircraftSpec): number {
  return settings.cg[aircraft.id] ?? aircraft.centerOfGravity[2]
}

/** How the pilot's airframe is rigged: perfect unless it needs trimming. */
export function buildFor(settings: Settings, aircraft: AircraftSpec): BuildTolerances {
  const build = settings.builds[aircraft.id]
  return build?.needsTrimming ? buildTolerances(aircraft, build.seed) : { ...PERFECT_BUILD }
}

const STORAGE_KEY = 'rcfsim.settings.v1'

function defaults(): Settings {
  return {
    transmitters: {},
    cg: {},
    builds: {},
    gamepads: {},
    controls: { touch: 'auto', pad: null },
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
      controls: { ...base.controls, ...saved.controls },
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
