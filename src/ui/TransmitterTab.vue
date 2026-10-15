<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useSettings } from '../stores/settings'
import { useFlight } from '../stores/flight'
import { pa18 } from '../sim/aircraft/pa18'
import { MODE_LAYOUT, type StickMode } from '../input/transmitter'

const settingsStore = useSettings()
const tx = computed(() => settingsStore.transmitterFor(pa18.id, pa18.lowRates))
const { channels } = storeToRefs(useFlight())

const modes: StickMode[] = [1, 2, 3, 4]
const describe = (mode: StickMode) => {
  const l = MODE_LAYOUT[mode]
  const left = ['leftY', 'leftX'].map((g) => Object.entries(l).find(([, v]) => v === g)![0])
  return `left: ${left.join(' + ')}`
}
const names = ['aileron', 'elevator', 'rudder'] as const
const outputs = computed(
  () =>
    [
      ['Aileron', channels.value?.aileron ?? 0],
      ['Elevator', channels.value?.elevator ?? 0],
      ['Rudder', channels.value?.rudder ?? 0],
      ['Throttle', (channels.value?.throttle ?? 0) * 2 - 1],
      ['Flap', (channels.value?.flap ?? 0) * 2 - 1],
    ] as const,
)
</script>

<template>
  <div class="tx">
    <label class="row">
      <span>Stick mode</span>
      <select v-model.number="tx.mode">
        <option v-for="m in modes" :key="m" :value="m">Mode {{ m }} ({{ describe(m) }})</option>
      </select>
    </label>

    <table>
      <thead>
        <tr>
          <th />
          <th>Low rate</th>
          <th>Expo</th>
          <th>Trim</th>
          <th>Reverse</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="n in names" :key="n">
          <td class="cap">{{ n }}</td>
          <td>
            <input
              v-model.number="tx.channels[n].lowRate"
              type="range"
              min="0.3"
              max="1"
              step="0.01"
            />
            <small>{{ Math.round(tx.channels[n].lowRate * 100) }}%</small>
          </td>
          <td>
            <input
              v-model.number="tx.channels[n].expo"
              type="range"
              min="0"
              max="0.8"
              step="0.05"
            />
            <small>{{ Math.round(tx.channels[n].expo * 100) }}%</small>
          </td>
          <td>
            <input
              v-model.number="tx.channels[n].trim"
              type="range"
              min="-0.25"
              max="0.25"
              step="0.005"
            />
            <small>{{ (tx.channels[n].trim * 100).toFixed(1) }}%</small>
          </td>
          <td><input v-model="tx.channels[n].reverse" type="checkbox" /></td>
        </tr>
      </tbody>
    </table>

    <label>
      <span
        >Flap → elevator mix <b>{{ Math.round(tx.flapElevatorMix * 100) }}%</b> (negative = down
        elevator)</span
      >
      <input v-model.number="tx.flapElevatorMix" type="range" min="-0.3" max="0.3" step="0.01" />
    </label>

    <div class="outputs">
      <div v-for="[label, v] in outputs" :key="label" class="out">
        <span>{{ label }}</span>
        <div class="bar">
          <div
            :style="{
              left: `${50 + Math.min(v, 0) * 50}%`,
              width: `${Math.abs(v) * 50}%`,
            }"
          />
        </div>
      </div>
    </div>
    <p class="hint">
      Settings are this model's memory on the virtual radio and are saved in your browser. Low rates
      default to the throws in the FMS manual.
    </p>
  </div>
</template>

<style scoped>
.tx {
  display: grid;
  gap: 14px;
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
label {
  display: grid;
  gap: 6px;
}
b {
  color: var(--accent);
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
th {
  text-align: left;
  color: var(--muted);
  font-weight: 500;
}
td {
  padding: 4px 6px 4px 0;
  vertical-align: middle;
}
td input[type='range'] {
  width: 90px;
  vertical-align: middle;
}
small {
  font-family: var(--mono);
  color: var(--muted);
  margin-left: 4px;
}
.cap {
  text-transform: capitalize;
}
.outputs {
  display: grid;
  gap: 4px;
}
.out {
  display: grid;
  grid-template-columns: 70px 1fr;
  align-items: center;
  font-size: 12px;
  color: var(--muted);
}
.bar {
  position: relative;
  height: 8px;
  border-radius: 4px;
  background:
    linear-gradient(var(--border), var(--border)) center / 1px 100% no-repeat,
    rgba(240, 246, 252, 0.08);
}
.bar div {
  position: absolute;
  top: 0;
  height: 100%;
  border-radius: 4px;
  background: var(--accent);
}
.hint {
  color: var(--muted);
  font-size: 12px;
  margin: 0;
}
@media (max-width: 600px) {
  td input[type='range'] {
    width: 60px;
  }
}
</style>
