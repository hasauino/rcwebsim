<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { FlightApp } from '../app/flight-app'
import { useFlight } from '../stores/flight'
import { useSettings } from '../stores/settings'
import { isTyping, type StickSide, type SwitchAction } from '../input/devices'
import { pa18 } from '../sim/aircraft/pa18'
import type { SpawnKind } from '../sim/simulation'
import HudPanel from './HudPanel.vue'
import SettingsPanel from './SettingsPanel.vue'
import DebugGraphs from './DebugGraphs.vue'
import TouchControls from './TouchControls.vue'
import { useFullscreen } from './fullscreen'
import { flightAppKey } from './flight-app-key'

const canvas = ref<HTMLCanvasElement | null>(null)
const flight = useFlight()
const settingsStore = useSettings()
const { settings } = settingsStore
const { telemetry, status, modelMissing, lastInput, failsafe } = storeToRefs(flight)
const settingsOpen = ref(false)
const showHelp = ref(true)
const { supported: canFullscreen, active: isFullscreen, toggle: toggleFullscreen } = useFullscreen()
let app: FlightApp | null = null
provide(flightAppKey, () => app)

const transmitter = () => settingsStore.transmitterFor(pa18.id, pa18.lowRates)

// Auto: on-screen sticks on touch-first devices, or once the screen is touched,
// until the keyboard or a gamepad flies again.
const touchFirst = window.matchMedia('(pointer: coarse)').matches
const showTouchSticks = computed(() => {
  const setting = settings.controls.touch
  if (setting !== 'auto') return setting === 'on'
  return lastInput.value ? lastInput.value === 'touch' : touchFirst
})

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
watch(
  () => settings.cg[pa18.id],
  () => app?.setCg(),
)
watch(
  () => ({ ...settings.builds[pa18.id] }),
  () => app?.setBuild(),
)
watch(settingsOpen, (open) => app?.setPaused(open))

function onKey(e: KeyboardEvent) {
  if (e.code === 'Escape') settingsOpen.value = !settingsOpen.value
  if (e.code === 'Slash' && !settingsOpen.value) showHelp.value = !showHelp.value
  if (e.code === 'KeyV' && !e.repeat && !isTyping(e)) toggleFullscreen()
}
window.addEventListener('keydown', onKey)
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const restart = (kind: SpawnKind) => app?.restart(kind)
const togglePause = () => app?.togglePause()
const touchDown = (side: StickSide) => app?.input.touchDown(side)
const touchMove = (side: StickSide, dx: number, dy: number) => app?.input.touchMove(side, dx, dy)
const touchUp = (side: StickSide) => app?.input.touchUp(side)
const pressSwitch = (action: SwitchAction) => app?.input.pressSwitch(action)
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
      <HudPanel
        :show-help="showHelp && !showTouchSticks"
        :touch-sticks="showTouchSticks"
        :fullscreen="canFullscreen ? isFullscreen : null"
        @settings="settingsOpen = true"
        @fullscreen="toggleFullscreen"
      />
      <DebugGraphs v-if="settings.debug.graphs" :class="{ touch: showTouchSticks }" />
      <TouchControls
        v-if="showTouchSticks && !settingsOpen"
        :mode="transmitter().mode"
        @touch-down="touchDown"
        @touch-move="touchMove"
        @touch-up="touchUp"
        @switch="pressSwitch"
        @restart="restart"
        @pause="togglePause"
      />

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
        <template v-if="showTouchSticks">Crashed — tap Runway, Air start or Hand launch</template>
        <template v-else>
          Crashed — press <kbd>R</kbd> to reset on the runway, <kbd>T</kbd> for an air start or
          <kbd>Y</kbd> for a hand launch
        </template>
      </div>
      <div v-else-if="failsafe" class="banner crash">
        FAILSAFE — the transmitter is gone: throttle cut, controls held
      </div>
      <div v-else-if="status === 'paused' && !settingsOpen" class="banner">
        <template v-if="showTouchSticks">Paused — tap Resume</template>
        <template v-else>Paused — press <kbd>P</kbd> to resume</template>
      </div>

      <SettingsPanel
        v-if="settingsOpen"
        @close="settingsOpen = false"
        @restart="restart"
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
  /* The sim owns every gesture: no pinch zoom, pull-to-refresh or double-tap zoom. */
  touch-action: none;
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
