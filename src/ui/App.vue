<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { FlightApp } from '../app/flight-app'
import { useFlight } from '../stores/flight'
import { useSettings } from '../stores/settings'
import { pa18 } from '../sim/aircraft/pa18'
import HudPanel from './HudPanel.vue'
import SettingsPanel from './SettingsPanel.vue'
import DebugGraphs from './DebugGraphs.vue'

const canvas = ref<HTMLCanvasElement | null>(null)
const flight = useFlight()
const settingsStore = useSettings()
const { settings } = settingsStore
const { telemetry, status, modelMissing } = storeToRefs(flight)
const settingsOpen = ref(false)
const showHelp = ref(true)
let app: FlightApp | null = null

const transmitter = () => settingsStore.transmitterFor(pa18.id, pa18.lowRates)

onMounted(async () => {
  try {
    app = new FlightApp(canvas.value!, settings, flight, transmitter)
    // Handle for driving the sim from devtools / browser automation.
    if (import.meta.env.DEV) (window as unknown as { rcfsim: FlightApp }).rcfsim = app
    await app.start()
  } catch (e) {
    flight.status = 'error'
    flight.error = e instanceof Error ? e.message : String(e)
    console.error(e)
  }
})

onBeforeUnmount(() => app?.dispose())

watch(
  () => ({ ...settings.wind }),
  () => app?.setWind(),
  { deep: true },
)
watch(settingsOpen, (open) => app?.setPaused(open))

function onKey(e: KeyboardEvent) {
  if (e.code === 'Escape') settingsOpen.value = !settingsOpen.value
  if (e.code === 'Slash' && !settingsOpen.value) showHelp.value = !showHelp.value
}
window.addEventListener('keydown', onKey)
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const reset = (kind: 'runway' | 'air') => app?.reset({ kind })
const downloadRecording = () => {
  if (!app) return
  const blob = new Blob([JSON.stringify(app.recording())], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `rcfsim-flight-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}
</script>

<template>
  <div class="stage">
    <canvas ref="canvas" class="view" />

    <div v-if="status === 'loading'" class="center-card panel">
      <div class="spinner" />
      <div>
        <strong>Preparing the field</strong>
        <div class="muted">{{ flight.loadingStep }}…</div>
      </div>
    </div>

    <div v-else-if="status === 'error'" class="center-card panel error">
      <strong>Couldn't start the simulator</strong>
      <p class="muted">{{ flight.error }}</p>
      <p class="muted">A browser with WebGPU or WebGL 2 is required.</p>
    </div>

    <template v-else>
      <HudPanel :show-help="showHelp" @settings="settingsOpen = true" />
      <DebugGraphs v-if="settings.debug.graphs" />

      <div v-if="modelMissing" class="notice panel">
        <strong>Aircraft model not installed</strong>
        <p>
          You're flying the aerodynamic debug view. Download the
          <a
            href="https://sketchfab.com/3d-models/piper-pa-18-413e3f81b0db4e0ebba0f27490732770"
            target="_blank"
            rel="noopener"
            >Piper PA-18 by helijah</a
          >
          (CC-BY 4.0) as glTF/GLB and save it as
          <code>public/models/pa18/pa18.glb</code>, then reload.
        </p>
      </div>

      <div v-if="telemetry?.crashed" class="banner crash">
        Crashed — press <kbd>R</kbd> to reset on the runway or <kbd>T</kbd> for an air start
      </div>
      <div v-else-if="status === 'paused' && !settingsOpen" class="banner">
        Paused — press <kbd>P</kbd> to resume
      </div>

      <SettingsPanel
        v-if="settingsOpen"
        @close="settingsOpen = false"
        @reset="reset"
        @download-recording="downloadRecording"
      />
    </template>
  </div>
</template>

<style scoped>
.stage {
  position: relative;
  width: 100%;
  height: 100%;
}
.view {
  display: block;
  width: 100%;
  height: 100%;
}
.center-card {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 18px 22px;
  max-width: min(440px, calc(100% - 32px));
}
.center-card.error {
  display: block;
}
.muted {
  color: var(--muted);
}
.spinner {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 3px solid var(--border);
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
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  max-width: min(560px, calc(100% - 32px));
  padding: 12px 16px;
  font-size: 13px;
  line-height: 1.45;
}
.notice p {
  margin: 6px 0 0;
  color: var(--muted);
}
.notice a {
  color: var(--accent);
}
.banner {
  position: absolute;
  top: 38%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 12px 20px;
  border-radius: var(--radius);
  background: var(--panel);
  border: 1px solid var(--border);
  font-weight: 600;
  text-align: center;
  max-width: calc(100% - 32px);
}
.banner.crash {
  border-color: var(--bad);
  color: #ffd7d7;
}
</style>
