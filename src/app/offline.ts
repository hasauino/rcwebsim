import { registerSW } from 'virtual:pwa-register'

let started = false

/**
 * Registers the service worker, which precaches the whole app for offline
 * play. Called once the hangar (or a flight) has loaded: on a first visit its
 * precache would otherwise share the connection with the hangar's download.
 */
export function cacheForOffline(): void {
  if (started) return
  started = true
  registerSW({ immediate: true })
}
