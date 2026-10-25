<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { AIRCRAFT, aircraftById } from '../sim/aircraft'
import type { AircraftSpec } from '../sim/aircraft/types'
import { HangarScene } from '../render/hangar/scene'
import { cacheForOffline } from '../app/offline'
import { isTyping } from '../input/devices'
import CreditsList from './CreditsList.vue'
import { hideSplash, showSplash, splashProgress } from './splash'

const props = defineProps<{ selected: string }>()
const emit = defineEmits<{ choose: [aircraft: AircraftSpec]; fly: [aircraft: AircraftSpec] }>()

const canvas = ref<HTMLCanvasElement | null>(null)
const panel = ref<HTMLElement | null>(null)
// Specs are static data: kept raw, so cards compare by identity (ADR-0009).
const chosen = shallowRef(aircraftById(props.selected))
const loading = ref(true)
const sceneFailed = ref(false)
const showCredits = ref(false)
let hangar: HangarScene | null = null
// Covers the swap from a flight at once, before the scene has drawn a frame.
showSplash()

const inches = (m: number) => +(m / 0.0254).toFixed(1)
const facts = (a: AircraftSpec) => [
  `${(a.surfaces[0]!.semiSpan * 2).toFixed(2)} m span`,
  `${a.mass.toFixed(2)} kg`,
  `${a.battery.cells}S · ${a.motor.kv} Kv · ${inches(a.propeller.diameter)}×${inches(a.propeller.pitch)}`,
]
const credit = computed(() => chosen.value.model.credit)

async function show(a: AircraftSpec) {
  if (!hangar) return
  loading.value = true
  await hangar.show(a)
  if (chosen.value === a) loading.value = false
}

onMounted(async () => {
  try {
    hangar = new HangarScene(canvas.value!)
    if (import.meta.env.DEV) (window as unknown as { hangar: HangarScene }).hangar = hangar
    // The plane goes up as soon as the renderer is ready; the room fills in
    // behind it. The loading screen covers it all until then.
    const ready = hangar.init(splashProgress)
    await show(chosen.value)
    await ready
    hideSplash()
    cacheForOffline()
  } catch (e) {
    hideSplash()
    cacheForOffline()
    // No WebGPU or WebGL 2 for the hangar; the cards still work.
    sceneFailed.value = true
    loading.value = false
    console.error(e)
  }
})
// The cards float over the scene: on the right, or along the bottom on a
// portrait phone. Tell the scene which, so the plane centres beside them.
const panelObserver = new ResizeObserver(() => {
  if (!hangar || !canvas.value || !panel.value) return
  const view = canvas.value.getBoundingClientRect()
  const cards = panel.value.getBoundingClientRect()
  const along = cards.width > view.width * 0.6
  hangar.setInsets(along ? 0 : view.right - cards.left, along ? view.bottom - cards.top : 0)
})
onMounted(() => {
  panelObserver.observe(panel.value!)
  panelObserver.observe(canvas.value!)
})
onBeforeUnmount(() => {
  // Enter flies even while the hangar is still loading.
  hideSplash()
  panelObserver.disconnect()
  hangar?.dispose()
})
watch(chosen, (a) => {
  emit('choose', a)
  void show(a)
})

function step(by: number) {
  const i = AIRCRAFT.indexOf(chosen.value)
  chosen.value = AIRCRAFT[(i + by + AIRCRAFT.length) % AIRCRAFT.length]!
}
function onKey(e: KeyboardEvent) {
  if (isTyping(e)) return
  if (showCredits.value) {
    if (e.code === 'Escape') showCredits.value = false
    return
  }
  if (e.code === 'Enter' || e.code === 'Space') emit('fly', chosen.value)
  else if (e.code === 'ArrowDown' || e.code === 'ArrowRight') step(1)
  else if (e.code === 'ArrowUp' || e.code === 'ArrowLeft') step(-1)
  else return
  e.preventDefault()
}
window.addEventListener('keydown', onKey)
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="hangar">
    <canvas ref="canvas" class="view" />
    <div v-if="loading" class="spinner" />
    <p v-if="sceneFailed" class="notice panel">
      The hangar needs WebGPU or WebGL 2. You can still choose and fly.
    </p>
    <p class="credit">
      Model: {{ credit.title }} by {{ credit.author }} ({{ credit.license }}) · drag to turn, scroll
      or pinch to zoom
    </p>

    <aside ref="panel" class="panel">
      <header>
        <div>
          <h1>Hangar</h1>
          <p>Choose your aircraft</p>
        </div>
        <button class="link" @click="showCredits = true">Credits</button>
      </header>
      <div class="cards" role="listbox" aria-label="Aircraft">
        <button
          v-for="a in AIRCRAFT"
          :key="a.id"
          class="card"
          role="option"
          :aria-selected="a === chosen"
          :class="{ selected: a === chosen }"
          @click="chosen = a"
          @dblclick="emit('fly', a)"
        >
          <span class="title">
            <strong>{{ a.name }}</strong>
            <span class="tag" :class="a.role">{{ a.role }}</span>
          </span>
          <span class="summary">{{ a.summary }}</span>
          <span class="facts">
            <span v-for="f in facts(a)" :key="f">{{ f }}</span>
          </span>
        </button>
      </div>
      <footer>
        <button class="primary fly" @click="emit('fly', chosen)">
          Fly the {{ chosen.name.replace(/ \(.*\)$/, '') }}
        </button>
        <small>Enter to fly · arrow keys to choose</small>
      </footer>
    </aside>

    <div v-if="showCredits" class="backdrop" @click.self="showCredits = false">
      <div class="dialog panel" role="dialog" aria-label="Credits">
        <header>
          <h2>Credits</h2>
          <button title="Close (Esc)" @click="showCredits = false">✕</button>
        </header>
        <CreditsList class="body" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.hangar {
  position: relative;
  width: 100%;
  height: 100%;
  background: var(--bg);
  touch-action: none;
}
.view {
  display: block;
  width: 100%;
  height: 100%;
  cursor: grab;
}
.view:active {
  cursor: grabbing;
}
.spinner {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 26px;
  height: 26px;
  margin: -13px 0 0 -13px;
  border-radius: 50%;
  border: 3px solid rgba(13, 17, 23, 0.25);
  border-top-color: var(--accent);
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.notice {
  position: absolute;
  top: 12px;
  left: 12px;
  margin: 0;
  padding: 8px 12px;
}
.credit {
  position: absolute;
  left: 14px;
  bottom: 10px;
  right: calc(var(--panel-width) + 32px);
  margin: 0;
  color: #fff;
  font-size: 12px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
  pointer-events: none;
}
.hangar {
  --panel-width: 340px;
}
aside {
  position: absolute;
  top: 16px;
  right: 16px;
  bottom: 16px;
  width: var(--panel-width);
  display: flex;
  flex-direction: column;
  min-height: 0;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  touch-action: auto;
}
aside header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 18px 18px 6px;
}
h1 {
  margin: 0;
  font-size: 20px;
}
aside header p {
  margin: 4px 0 0;
  color: var(--muted);
}
.link {
  background: none;
  border: none;
  padding: 2px 0;
  color: var(--accent);
}
.link:hover {
  background: none;
  text-decoration: underline;
}
.cards {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 18px;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: left;
  padding: 12px 14px;
  border-radius: var(--radius);
}
.card.selected {
  border-color: var(--accent);
  background: rgba(245, 165, 36, 0.14);
}
.title {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.tag {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
}
.tag.aerobat {
  color: var(--accent);
}
.summary {
  color: var(--muted);
  line-height: 1.4;
}
.facts {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-family: var(--mono);
  font-size: 12px;
}
footer {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 18px 18px;
  border-top: 1px solid var(--border);
}
.fly {
  padding: 10px 14px;
  font-size: 15px;
}
footer small {
  color: var(--muted);
  text-align: center;
}
.backdrop {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.35);
  touch-action: auto;
}
.dialog {
  width: min(640px, 100%);
  max-height: 100%;
  display: flex;
  flex-direction: column;
}
.dialog header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.dialog h2 {
  margin: 0;
  font-size: 16px;
}
.dialog .body {
  overflow-y: auto;
  padding: 4px 16px 12px;
}

@media (pointer: coarse) {
  footer small {
    display: none;
  }
}
@media (max-width: 720px) and (orientation: portrait) {
  aside {
    top: auto;
    left: 10px;
    right: 10px;
    bottom: 10px;
    width: auto;
    max-height: 52%;
  }
  .credit {
    display: none;
  }
  aside header {
    padding: 12px 16px 0;
  }
  .cards {
    padding: 10px 16px;
  }
  footer {
    padding: 10px 16px 14px;
  }
}
@media (max-height: 480px) and (orientation: landscape) {
  .hangar {
    --panel-width: 300px;
  }
  aside {
    top: 8px;
    right: 8px;
    bottom: 8px;
  }
  aside header {
    padding: 10px 14px 0;
  }
  aside header p {
    display: none;
  }
  .cards {
    padding: 8px 14px;
    gap: 8px;
  }
  .summary {
    display: none;
  }
  footer {
    padding: 8px 14px 10px;
  }
  footer small {
    display: none;
  }
}
</style>
