/**
 * The loading screen over the hangar while it loads, on a cold start and on
 * the way back from a flight. `index.html` draws it before any script
 * arrives; this turns its tips and fills its bar from the hangar's progress
 * until every layer has loaded, then fades it out. After a while the pilot
 * may go in early and watch the rest arrive.
 */

const TIPS = [
  'When the plane flies towards you, left and right seem reversed. Push the aileron stick towards the low wing to pick it up.',
  'Taking off a taildragger: open the throttle smoothly and steer with the rudder. Let the tail come up, then ease off the ground.',
  'Land into the wind. A headwind slows you over the ground and shortens the landing.',
  'The stall speed rises in a turn. Keep your speed up in steep turns, above all near the ground.',
  'Hand launch with Y: throw firmly, wings level. Set the launch speed in the Launch tab; a weak throw sinks back to the ground.',
  'Trim the elevator with I and K until the plane holds its height hands off.',
  'Flaps on F let the Cub land slower. If it pitches up as they drop, a flap → elevator mix in the Transmitter tab cancels it.',
  'E switches dual rates. Fly the Extra 300 on low rates first: on high it rolls at over 700° a second.',
  'Move the CG in the Balance tab. Nose-heavy is steady but sluggish; tail-heavy is twitchy and hard to recover from a stall.',
  'Q starts walk mode: walk the field with WASD while the plane keeps flying. B brings you back to the pilot station.',
  'Got a radio? Plug it in with a USB sim cable and fly with your own transmitter.',
  'H is throttle hold: the motor stays off whatever the stick says.',
  'Turn on wind and turbulence in the Wind tab once you can fly a circuit in still air.',
  'C switches to the chase view, V goes full screen, and Esc opens the settings.',
]
const TIP_SECONDS = 7
const SKIP_AFTER_SECONDS = 8
/** How fast the bar catches up with what has loaded, 1/s. */
const CATCH_UP = 5
/** While one big file downloads, the bar creeps on this much per second, up to `CREEP_AHEAD`. */
const CREEP = 0.01
const CREEP_AHEAD = 0.08

const splash = document.getElementById('splash')
let loaded = 0
let shown = 0
let hidden = !splash
/** Stops the tips and the bar; null while they aren't running. */
let stop: (() => void) | null = null
let removal = 0

/** Covers the hangar at once and starts the tips and the bar from empty. */
export function showSplash(): void {
  if (!splash || stop) return
  window.clearTimeout(removal)
  splash.hidden = false
  splash.classList.remove('gone')
  hidden = false
  loaded = 0
  shown = 0
  const fill = splash.querySelector<HTMLElement>('.fill')!
  const status = splash.querySelector<HTMLElement>('.status')!
  const tip = splash.querySelector<HTMLElement>('.tip')!
  const skip = splash.querySelector<HTMLButtonElement>('.skip')!
  fill.style.transform = 'scaleX(0)'

  let next = Math.floor(Math.random() * TIPS.length)
  const showTip = () => {
    tip.innerHTML = '<b>Tip</b>'
    tip.append(TIPS[next]!)
    next = (next + 1) % TIPS.length
  }
  showTip()
  const tips = window.setInterval(() => {
    tip.classList.add('fading')
    window.setTimeout(() => {
      showTip()
      tip.classList.remove('fading')
    }, 400)
  }, TIP_SECONDS * 1000)
  skip.classList.remove('shown')
  const skipTimer = window.setTimeout(() => skip.classList.add('shown'), SKIP_AFTER_SECONDS * 1000)
  skip.onclick = hideSplash

  let last = performance.now()
  let raf = 0
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    const caughtUp = shown + (loaded - shown) * Math.min(1, dt * CATCH_UP)
    const crept = Math.min(shown + dt * CREEP, loaded + CREEP_AHEAD, 0.99)
    shown = Math.max(shown, caughtUp, crept)
    fill.style.transform = `scaleX(${shown})`
    status.textContent = `Loading the hangar… ${Math.round(shown * 100)}%`
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
  stop = () => {
    window.clearInterval(tips)
    window.clearTimeout(skipTimer)
    cancelAnimationFrame(raf)
    stop = null
  }
}

/** The share of the hangar loaded so far, 0–1. */
export function splashProgress(fraction: number): void {
  loaded = Math.max(loaded, fraction)
}

/** Fades the loading screen out, then hides it until the hangar next loads. */
export function hideSplash(): void {
  if (hidden || !splash) return
  hidden = true
  stop?.()
  splash.querySelector<HTMLElement>('.fill')!.style.transform = 'scaleX(1)'
  splash.classList.add('gone')
  removal = window.setTimeout(() => (splash.hidden = true), 600)
}
