import { registerSW } from 'virtual:pwa-register'

let started = false

/** The worker's runtime caches (`runtimeCaching` in vite.config.ts), by the paths they hold. */
const RUNTIME_CACHES = { hangar: '/assets/hangar/', models: '/models/' }

/**
 * Registers the service worker, which precaches the whole app for offline
 * play. Called once the hangar (or a flight) has loaded: on a first visit its
 * precache would otherwise share the connection with the hangar's download.
 */
export function cacheForOffline(): void {
  if (started) return
  started = true
  registerSW({ immediate: true })
  // The worker caches the hangar's files and the other aircraft as they
  // load, but on a first visit they loaded before it ran. Put them in its
  // caches now; they come from the browser's HTTP cache, not the network.
  if (!import.meta.env.PROD || !('caches' in window)) return
  const loaded = performance.getEntriesByType('resource').map((e) => e.name)
  for (const [name, path] of Object.entries(RUNTIME_CACHES)) {
    const urls = loaded.filter((url) => new URL(url).pathname.includes(path))
    if (urls.length)
      void caches
        .open(name)
        .then((cache) => cache.addAll(urls))
        .catch(() => {})
  }
}
