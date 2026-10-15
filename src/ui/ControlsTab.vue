<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useFlight } from '../stores/flight'
import { useSettings } from '../stores/settings'
import { GIMBALS, normaliseAxis, type SwitchAction } from '../input/devices'
import type { Gimbal } from '../input/transmitter'

const flight = useFlight()
const { activePad, rawAxes, rawButtons } = storeToRefs(flight)
const { settings } = useSettings()

const profile = computed(() => (activePad.value ? settings.gamepads[activePad.value] : undefined))
const gimbalLabel: Record<Gimbal, string> = {
  leftX: 'Left stick ↔',
  leftY: 'Left stick ↕',
  rightX: 'Right stick ↔',
  rightY: 'Right stick ↕',
}
const actions: { key: SwitchAction; label: string }[] = [
  { key: 'rates', label: 'Dual rates' },
  { key: 'flaps', label: 'Flap switch' },
  { key: 'throttleHold', label: 'Throttle hold' },
  { key: 'reset', label: 'Reset' },
  { key: 'camera', label: 'Camera' },
]

function value(g: Gimbal): number {
  const p = profile.value
  if (!p) return 0
  const m = p.axes[g]
  const raw = rawAxes.value[m.index]
  return raw === undefined ? 0 : normaliseAxis(raw, m, p.deadzone)
}

// Calibration: sweep every stick to its limits, then centre and finish.
const calibrating = ref(false)
const extremes = ref<{ min: number; max: number }[]>([])
watch(rawAxes, (axes) => {
  if (!calibrating.value) return
  axes.forEach((v, i) => {
    const e = (extremes.value[i] ??= { min: v, max: v })
    e.min = Math.min(e.min, v)
    e.max = Math.max(e.max, v)
  })
})
function startCalibration() {
  extremes.value = rawAxes.value.map((v) => ({ min: v, max: v }))
  calibrating.value = true
}
function finishCalibration() {
  const p = profile.value
  calibrating.value = false
  if (!p) return
  for (const g of GIMBALS) {
    const m = p.axes[g]
    const e = extremes.value[m.index]
    if (!e || e.max - e.min < 0.2) continue
    m.min = e.min
    m.max = e.max
    // Centring sticks report their rest position; throttle uses mid-travel.
    const rest = rawAxes.value[m.index] ?? 0
    m.center = rest > e.min + 0.1 && rest < e.max - 0.1 ? rest : (e.min + e.max) / 2
  }
}

// Button assignment: the next button pressed is bound to the action.
const listening = ref<SwitchAction | null>(null)
watch(rawButtons, (buttons, previous) => {
  const p = profile.value
  if (!listening.value || !p) return
  const index = buttons.findIndex((b, i) => b && !previous?.[i])
  if (index >= 0) {
    p.buttons[listening.value] = index
    listening.value = null
  }
})
</script>

<template>
  <div class="controls">
    <label class="row">
      <span>On-screen touch sticks</span>
      <select v-model="settings.controls.touch">
        <option value="auto">Auto (on touch screens)</option>
        <option value="on">Always</option>
        <option value="off">Never</option>
      </select>
    </label>

    <div class="device">
      <span class="dot" :class="{ on: activePad }" />
      <span v-if="activePad">{{ activePad }}</span>
      <span v-else class="muted">
        No gamepad or USB transmitter detected — plug one in and move a stick. Keyboard works
        meanwhile.
      </span>
    </div>

    <template v-if="profile">
      <table>
        <thead>
          <tr>
            <th>Gimbal</th>
            <th>Axis</th>
            <th>Reverse</th>
            <th>Position</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="g in GIMBALS" :key="g">
            <td>{{ gimbalLabel[g] }}</td>
            <td>
              <select v-model.number="profile.axes[g].index">
                <option :value="-1">—</option>
                <option v-for="(_, i) in rawAxes" :key="i" :value="i">Axis {{ i }}</option>
              </select>
            </td>
            <td><input v-model="profile.axes[g].invert" type="checkbox" /></td>
            <td>
              <div class="meter">
                <div :style="{ left: `${50 + value(g) * 50}%` }" />
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="row">
        <button v-if="!calibrating" @click="startCalibration">Calibrate sticks</button>
        <template v-else>
          <span class="muted">Move every stick to all its limits, centre them, then</span>
          <button class="primary" @click="finishCalibration">Finish</button>
        </template>
      </div>

      <label class="row">
        <span>Throttle stick</span>
        <select v-model="profile.throttleStyle">
          <option value="absolute">Non-centring (RC transmitter)</option>
          <option value="incremental">Self-centring (gamepad: push to add power)</option>
        </select>
      </label>
      <label>
        <span
          >Deadzone <b>{{ Math.round(profile.deadzone * 100) }}%</b></span
        >
        <input v-model.number="profile.deadzone" type="range" min="0" max="0.2" step="0.01" />
      </label>

      <div class="buttons">
        <div v-for="a in actions" :key="a.key" class="row">
          <span>{{ a.label }}</span>
          <button @click="listening = a.key">
            {{
              listening === a.key
                ? 'Press a button…'
                : profile.buttons[a.key] !== undefined
                  ? `Button ${profile.buttons[a.key]}`
                  : 'Assign'
            }}
          </button>
        </div>
      </div>
    </template>

    <details>
      <summary>Keyboard</summary>
      <p class="muted">
        Arrows: aileron and elevator · A/D: rudder · W/S: throttle · hold Shift for fine control · F
        flaps · E rates · H throttle hold · trims I/K elevator, J/L aileron, U/O rudder · R reset ·
        T air start · C camera · P pause · G aero overlay.
      </p>
    </details>

    <details>
      <summary>Touch</summary>
      <p class="muted">
        Put a thumb anywhere on a stick pad: that spot is centre. The throttle stays where you leave
        it and moves on from there; the other sticks spring back when you lift your thumb. Which pad
        flies what follows the stick mode on the Transmitter tab.
      </p>
    </details>
  </div>
</template>

<style scoped>
.controls {
  display: grid;
  gap: 14px;
}
.device {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--muted);
  flex: none;
}
.dot.on {
  background: var(--good);
}
.muted {
  color: var(--muted);
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
  padding: 4px 6px;
}
td {
  padding: 4px 6px;
}
.meter {
  position: relative;
  height: 8px;
  min-width: 90px;
  border-radius: 4px;
  background: rgba(240, 246, 252, 0.1);
}
.meter div {
  position: absolute;
  top: -2px;
  width: 4px;
  height: 12px;
  margin-left: -2px;
  border-radius: 2px;
  background: var(--accent);
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
.buttons {
  display: grid;
  gap: 6px;
}
</style>
