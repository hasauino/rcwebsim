import { onBeforeUnmount, ref } from 'vue'

/** The Keyboard Lock API (Chromium only), not yet in TypeScript's DOM lib. */
interface KeyboardLock {
  lock(codes?: string[]): Promise<void>
  unlock(): void
}

/**
 * Fullscreen for the whole page, so the HUD and settings overlay stay visible.
 * Browsers exit fullscreen on Esc, which would steal the settings key; where
 * Keyboard Lock exists, Esc is locked to the page and holding it still exits.
 */
export function useFullscreen() {
  const supported = document.fullscreenEnabled
  const active = ref(document.fullscreenElement !== null)
  const keyboard = (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard

  const onChange = () => {
    active.value = document.fullscreenElement !== null
    if (active.value) keyboard?.lock(['Escape']).catch(() => {})
    else keyboard?.unlock()
  }
  document.addEventListener('fullscreenchange', onChange)
  onBeforeUnmount(() => document.removeEventListener('fullscreenchange', onChange))

  const toggle = () => {
    if (!supported) return
    const pending = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen()
    pending.catch((e) => console.warn('Fullscreen request failed', e))
  }

  return { supported, active, toggle }
}
