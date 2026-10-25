<script setup lang="ts">
import { inject, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useSettings } from '../stores/settings'
import { useFlight } from '../stores/flight'
import { AIRCRAFT } from '../sim/aircraft'
import { HAND_LAUNCH_SPEED, type SpawnKind } from '../sim/simulation'
import { aircraftKey } from './flight-app-key'
import ControlsTab from './ControlsTab.vue'
import TransmitterTab from './TransmitterTab.vue'
import BalanceTab from './BalanceTab.vue'

const emit = defineEmits<{
  close: []
  changeAircraft: []
  restart: [kind: SpawnKind]
  downloadRecording: []
}>()

const { settings } = useSettings()
const { renderer } = storeToRefs(useFlight())
const tabs = [
  'Controls',
  'Transmitter',
  'Balance',
  'Wind',
  'Launch',
  'View',
  'Debug',
  'Credits',
] as const
const tab = ref<(typeof tabs)[number]>('Controls')
const aircraft = inject(aircraftKey)!

function restart(kind: SpawnKind) {
  emit('restart', kind)
  emit('close')
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div class="dialog panel" role="dialog" aria-label="Settings">
      <header>
        <nav>
          <button v-for="t in tabs" :key="t" :class="{ active: t === tab }" @click="tab = t">
            {{ t }}
          </button>
        </nav>
        <button title="Close (Esc)" @click="emit('close')">✕</button>
      </header>

      <section class="body">
        <ControlsTab v-if="tab === 'Controls'" />
        <TransmitterTab v-else-if="tab === 'Transmitter'" />
        <BalanceTab v-else-if="tab === 'Balance'" />

        <div v-else-if="tab === 'Wind'" class="form">
          <label>
            <span
              >Wind speed <b>{{ settings.wind.speed.toFixed(1) }} m/s</b></span
            >
            <input v-model.number="settings.wind.speed" type="range" min="0" max="12" step="0.5" />
          </label>
          <label>
            <span
              >From <b>{{ settings.wind.fromDeg }}°</b> (90° = east, down the runway)</span
            >
            <input v-model.number="settings.wind.fromDeg" type="range" min="0" max="355" step="5" />
          </label>
          <label>
            <span
              >Turbulence <b>{{ settings.wind.turbulence.toFixed(1) }}×</b></span
            >
            <input
              v-model.number="settings.wind.turbulence"
              type="range"
              min="0"
              max="2"
              step="0.1"
            />
          </label>
          <p class="hint">Turbulence follows the Dryden model: stronger wind, stronger gusts.</p>
        </div>

        <div v-else-if="tab === 'Launch'" class="form">
          <label>
            <span
              >Hand launch speed <b>{{ settings.launch.speed.toFixed(1) }} m/s</b></span
            >
            <input
              v-model.number="settings.launch.speed"
              type="range"
              min="2"
              max="15"
              step="0.5"
            />
          </label>
          <p class="hint">
            How hard the pilot throws, at full power, down the runway heading from where they stand.
            A headwind adds to it. A firm throw ({{ HAND_LAUNCH_SPEED }} m/s) climbs away hands off.
            A weaker throw sinks towards the ground: hold the nose up gently, wings level, while the
            motor drags it clear. Pull too hard and it stalls. Throw with <kbd>Y</kbd>.
          </p>
        </div>

        <div v-else-if="tab === 'View'" class="form">
          <label class="row">
            <span>Camera</span>
            <select v-model="settings.camera.mode">
              <option value="pilot">Pilot view (at the pilot station)</option>
              <option value="chase">Chase view</option>
            </select>
          </label>
          <label class="row">
            <span>Auto-zoom in pilot view</span>
            <input v-model="settings.camera.autoZoom" type="checkbox" />
          </label>
          <label>
            <span
              >Field of view <b>{{ settings.camera.fov }}°</b></span
            >
            <input v-model.number="settings.camera.fov" type="range" min="25" max="80" step="1" />
          </label>
          <label class="row">
            <span>Graphics quality (applies on reload)</span>
            <select v-model="settings.graphics.quality">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label class="row">
            <span>Shadows</span>
            <input v-model="settings.graphics.shadows" type="checkbox" />
          </label>
          <label class="row">
            <span>Grass blades</span>
            <input v-model="settings.graphics.grass" type="checkbox" />
          </label>
          <label>
            <span
              >Volume <b>{{ Math.round(settings.audio.volume * 100) }}%</b></span
            >
            <input
              v-model.number="settings.audio.volume"
              type="range"
              min="0"
              max="1"
              step="0.05"
            />
          </label>
        </div>

        <div v-else-if="tab === 'Debug'" class="form">
          <label class="row">
            <span>Aerodynamic overlay <kbd>G</kbd></span>
            <input v-model="settings.debug.overlay" type="checkbox" />
          </label>
          <label class="row">
            <span>Live graphs</span>
            <input v-model="settings.debug.graphs" type="checkbox" />
          </label>
          <p class="hint">
            Overlay panels: green attached flow, amber near stall, red stalled, blue in the prop
            wash. White lines are each strip's aerodynamic force.
          </p>
          <div class="row">
            <span>Current flight's inputs (replayable)</span>
            <button @click="emit('downloadRecording')">Download recording</button>
          </div>
          <p class="hint">Renderer: {{ renderer }}</p>
        </div>

        <div v-else class="credits">
          <p v-for="a in AIRCRAFT" :key="a.id">
            <strong>{{ a.model.credit.title }}</strong> 3D model by {{ a.model.credit.author }},
            <a :href="a.model.credit.url" target="_blank" rel="noopener">source</a>, licensed
            {{ a.model.credit.license }}.
          </p>
          <p>
            Sky HDRI and grass texture from Poly Haven (CC0). Trees from Kenney's Nature Kit (CC0).
          </p>
          <p>
            Airfoil coordinates from the UIUC Airfoil Coordinates Database; polars generated with
            XFoil.
          </p>
          <p>Physics: Rapier. Rendering: three.js.</p>
        </div>
      </section>

      <footer>
        <button class="change" :title="aircraft.name" @click="emit('changeAircraft')">
          Change aircraft
        </button>
        <button @click="restart('runway')">Restart on runway</button>
        <button @click="restart('air')">Air start</button>
        <button @click="restart('hand')">Hand launch</button>
        <button class="primary" @click="emit('close')">Fly</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: absolute;
  inset: 0;
  background: rgba(1, 4, 9, 0.45);
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  place-items: center;
  padding: 16px;
}
.dialog {
  width: min(680px, 100%);
  max-height: calc(100% - 32px);
  display: flex;
  flex-direction: column;
  background: var(--panel-solid);
}
header,
footer {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}
footer {
  border-bottom: 0;
  border-top: 1px solid var(--border);
  justify-content: flex-end;
  flex-wrap: wrap;
}
footer .change {
  margin-right: auto;
}
nav {
  display: flex;
  gap: 4px;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
}
nav button {
  background: transparent;
  border-color: transparent;
  white-space: nowrap;
}
nav button.active {
  background: rgba(245, 165, 36, 0.15);
  border-color: rgba(245, 165, 36, 0.4);
  color: var(--accent);
}
.body {
  padding: 16px;
  overflow-y: auto;
}
.form {
  display: grid;
  gap: 14px;
}
.form label {
  display: grid;
  gap: 6px;
}
.form .row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.form b {
  color: var(--accent);
  font-weight: 600;
}
.hint {
  color: var(--muted);
  font-size: 12px;
  margin: 0;
}
.credits {
  line-height: 1.6;
}
.credits a {
  color: var(--accent);
}
</style>
