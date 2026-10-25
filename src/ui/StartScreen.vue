<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { AIRCRAFT, aircraftById } from '../sim/aircraft'
import type { AircraftSpec } from '../sim/aircraft/types'
import { AircraftPreview } from '../render/preview'
import { isTyping } from '../input/devices'

const props = defineProps<{ selected: string }>()
const emit = defineEmits<{ fly: [aircraft: AircraftSpec] }>()

const canvas = ref<HTMLCanvasElement | null>(null)
// Specs are static data: kept raw, so cards compare by identity (ADR-0009).
const chosen = shallowRef(aircraftById(props.selected))
const loading = ref(true)
const previewFailed = ref(false)
let preview: AircraftPreview | null = null

const inches = (m: number) => +(m / 0.0254).toFixed(1)
const facts = (a: AircraftSpec) => [
  `${(a.surfaces[0]!.semiSpan * 2).toFixed(2)} m span`,
  `${a.mass.toFixed(2)} kg`,
  `${a.battery.cells}S · ${a.motor.kv} Kv · ${inches(a.propeller.diameter)}×${inches(a.propeller.pitch)}`,
]
const credit = computed(() => chosen.value.model.credit)

async function show(a: AircraftSpec) {
  if (!preview) return
  loading.value = true
  await preview.show(a)
  if (chosen.value === a) loading.value = false
}

onMounted(async () => {
  try {
    preview = new AircraftPreview(canvas.value!)
    await preview.init()
    await show(chosen.value)
  } catch (e) {
    // No WebGPU or WebGL 2 for the turntable; the cards still work.
    previewFailed.value = true
    loading.value = false
    console.error(e)
  }
})
onBeforeUnmount(() => preview?.dispose())
watch(chosen, (a) => void show(a))

function step(by: number) {
  const i = AIRCRAFT.indexOf(chosen.value)
  chosen.value = AIRCRAFT[(i + by + AIRCRAFT.length) % AIRCRAFT.length]!
}
function onKey(e: KeyboardEvent) {
  if (isTyping(e)) return
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
  <div class="start">
    <div class="stage">
      <canvas ref="canvas" class="view" />
      <div v-if="loading" class="spinner" />
      <p v-if="previewFailed" class="notice">
        The 3D preview needs WebGPU or WebGL 2. You can still choose and fly.
      </p>
      <p class="credit">
        Model: {{ credit.title }} by {{ credit.author }} ({{ credit.license }}) · drag to turn,
        scroll or pinch to zoom
      </p>
    </div>

    <aside class="panel">
      <header>
        <h1>RC Flight Sim</h1>
        <p>Choose your aircraft</p>
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
  </div>
</template>

<style scoped>
.start {
  display: grid;
  grid-template-columns: 1fr minmax(280px, 360px);
  width: 100%;
  height: 100%;
  background: var(--bg);
}
.stage {
  position: relative;
  min-width: 0;
  min-height: 0;
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
.notice,
.credit {
  position: absolute;
  left: 12px;
  right: 12px;
  margin: 0;
  color: #1d2530;
  font-size: 12px;
  text-shadow: 0 0 6px rgba(255, 255, 255, 0.6);
}
.notice {
  top: 12px;
}
.credit {
  bottom: 10px;
}
aside {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-radius: 0;
  border-width: 0 0 0 1px;
  background: var(--panel-solid);
}
header {
  padding: 18px 18px 6px;
}
h1 {
  margin: 0;
  font-size: 20px;
}
header p {
  margin: 4px 0 0;
  color: var(--muted);
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
  background: rgba(245, 165, 36, 0.1);
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

@media (pointer: coarse) {
  footer small {
    display: none;
  }
}
@media (max-width: 720px) and (orientation: portrait) {
  .start {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 42%) minmax(0, 1fr);
  }
  aside {
    border-width: 1px 0 0;
  }
  header {
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
  header {
    padding: 10px 14px 0;
  }
  header p {
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
