<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useFlight } from '../stores/flight'
import { useSettings } from '../stores/settings'
import {
  CHANNELS,
  GIMBALS,
  gamepadDefaults,
  normaliseAxis,
  radioDefaults,
  type AxisMapping,
  type SwitchAction,
} from '../input/devices'
import type { RadioSetupStep } from '../input/radio-setup'
import type { Gimbal } from '../input/transmitter'
import type { Channel } from '../sim/aircraft/types'
import { flightAppKey } from './flight-app-key'

const flight = useFlight()
const { activePad, pads, rawAxes, setup, learning } = storeToRefs(flight)
const { settings } = useSettings()
const app = inject(flightAppKey, () => null)

const profile = computed(() => (activePad.value ? settings.gamepads[activePad.value] : undefined))
const gamepad = computed(() => (profile.value?.kind === 'gamepad' ? profile.value : undefined))
const radio = computed(() => (profile.value?.kind === 'radio' ? profile.value : undefined))

// Safari only shows a gamepad after a button press, and sim cables have none.
const safari = /^((?!chrome|chromium|crios|fxios|edg|android).)*safari/i.test(navigator.userAgent)

function setKind(kind: 'gamepad' | 'radio') {
  if (!activePad.value || profile.value?.kind === kind) return
  settings.gamepads[activePad.value] = kind === 'radio' ? radioDefaults() : gamepadDefaults()
}

const gimbalLabel: Record<Gimbal, string> = {
  leftX: 'Left stick ↔',
  leftY: 'Left stick ↕',
  rightX: 'Right stick ↔',
  rightY: 'Right stick ↕',
}
const channelLabel: Record<Channel, string> = {
  aileron: 'Aileron',
  elevator: 'Elevator',
  throttle: 'Throttle',
  rudder: 'Rudder',
  flap: 'Flap',
}
const actions: { key: SwitchAction; label: string; positions: 2 | 3 }[] = [
  { key: 'rates', label: 'Dual rates', positions: 2 },
  { key: 'flaps', label: 'Flap switch', positions: 3 },
  { key: 'throttleHold', label: 'Throttle hold', positions: 2 },
  { key: 'reset', label: 'Reset', positions: 2 },
  { key: 'camera', label: 'Camera', positions: 2 },
]
// While the radio is the transmitter, rates, flaps and throttle cut are the radio's own.
const radioActions = computed(() =>
  radio.value?.receiverOnly
    ? actions.filter((a) => a.key === 'reset' || a.key === 'camera')
    : actions,
)

function value(m: AxisMapping, deadzone: number): number {
  const raw = rawAxes.value[m.index]
  return raw === undefined ? 0 : normaliseAxis(raw, m, deadzone)
}

// Gamepad calibration: sweep every stick to its limits, then centre and finish.
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
  const p = gamepad.value
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

// Switch assignment: the next button pressed, or switch flipped on, is bound to the action.
const listen = (action: SwitchAction, positions: 2 | 3) =>
  app()?.input.learnSwitch(action, positions)
function bindingLabel(action: SwitchAction): string {
  if (learning.value === action) return radio.value ? 'Flip the switch on…' : 'Press a button…'
  const b = profile.value?.switches[action]
  if (!b) return 'Assign'
  return 'button' in b ? `Button ${b.button}` : `Axis ${b.axis} (${b.positions}-pos)`
}

// Radio setup, run by the input devices: these words lead the pilot through it.
const prompts: Record<RadioSetupStep, string> = {
  centre:
    'Select high rates and 100% travel. Centre every trim and sub-trim, let the sticks centre, ' +
    'put the throttle down and the flaps up.',
  aileron: 'Move the aileron stick fully right, then let it go.',
  elevator: 'Pull the elevator stick fully back, then let it go.',
  rudder: 'Move the rudder stick fully right, then let it go.',
  throttle: 'Push the throttle fully up, then back down.',
  flap: 'Set the flap switch to full flap, then back up. Skip if the radio has no flap channel.',
  sweep:
    'Move every stick, switch and knob to all its limits a couple of times, then centre the ' +
    'sticks and put the throttle down.',
  still: 'Take your hands off the radio while the cable settles…',
  done: 'Your radio is set up.',
}
const startSetup = () => app()?.input.startRadioSetup()
const setupNext = () => app()?.input.setup?.next()
const setupSkip = () => app()?.input.setup?.skip()
const setupClose = () => app()?.input.setup?.close()
const percent = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`
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
        <template v-if="safari">
          Safari can't see USB transmitters on a sim cable: use Chrome or Edge to fly with one.
        </template>
      </span>
    </div>
    <p class="muted probe">
      To see exactly what the browser reads from a radio or gamepad, open the
      <a href="input-probe.html" target="_blank" rel="noopener">input probe</a>.
    </p>

    <label v-if="pads.length > 1" class="row">
      <span>Fly with</span>
      <select v-model="settings.controls.pad">
        <option :value="null">Whichever I move</option>
        <option v-for="id in pads" :key="id" :value="id">{{ id }}</option>
      </select>
    </label>

    <label v-if="profile" class="row">
      <span>This device is</span>
      <select
        :value="profile.kind"
        @change="setKind(($event.target as HTMLSelectElement).value as 'gamepad' | 'radio')"
      >
        <option value="radio">An RC transmitter on a USB sim cable</option>
        <option value="gamepad">A gamepad</option>
      </select>
    </label>

    <div v-if="setup" class="wizard">
      <p>
        <b>{{ prompts[setup.step] }}</b>
      </p>
      <p v-if="setup.assigned.length" class="muted">
        Found: {{ setup.assigned.map((c) => channelLabel[c]).join(', ') }}
      </p>
      <p v-if="setup.step === 'still'" class="muted">
        {{ setup.steady ? 'Steady — nearly done.' : 'Still moving…' }}
      </p>
      <ul v-if="setup.step === 'done' && setup.offCentre.length" class="warn">
        <li v-for="o in setup.offCentre" :key="o.channel">
          {{ channelLabel[o.channel] }} rests at {{ percent(o.value) }}: a trim or sub-trim wasn't
          centred. It is kept, so the plane will feel it. Centre it and set up again if you didn't
          mean it.
        </li>
      </ul>
      <div class="row">
        <button v-if="setup.step === 'done'" class="primary" @click="setupClose">Done</button>
        <template v-else>
          <button @click="setupClose">Cancel</button>
          <span>
            <button v-if="setup.step === 'flap'" @click="setupSkip">Skip</button>
            <button
              v-if="setup.step === 'centre' || setup.step === 'sweep'"
              class="primary"
              @click="setupNext"
            >
              Next
            </button>
          </span>
        </template>
      </div>
    </div>

    <template v-else-if="radio">
      <label class="check">
        <input v-model="radio.receiverOnly" type="checkbox" />
        <span>
          <b>My radio is the transmitter.</b> The sim is only the receiver: your radio's rates,
          expo, trims, mixes, flap switch and throttle cut fly the plane, as at the field. Untick if
          your radio's trainer output skips its settings (Student mode on some FlySky radios); the
          sim's transmitter then shapes the sticks.
        </span>
      </label>

      <div class="row">
        <span class="muted">Find each channel and its travel by moving the controls.</span>
        <button class="primary" @click="startSetup">Set up radio</button>
      </div>

      <table>
        <thead>
          <tr>
            <th>Channel</th>
            <th>Axis</th>
            <th>Reverse</th>
            <th>Position</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in CHANNELS" :key="c">
            <td>{{ channelLabel[c] }}</td>
            <td>
              <select v-model.number="radio.channels[c].index">
                <option :value="-1">—</option>
                <option v-for="(_, i) in rawAxes" :key="i" :value="i">Axis {{ i }}</option>
              </select>
            </td>
            <td><input v-model="radio.channels[c].invert" type="checkbox" /></td>
            <td>
              <div class="meter">
                <div :style="{ left: `${50 + value(radio.channels[c], 0) * 50}%` }" />
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="buttons">
        <div v-for="a in radioActions" :key="a.key" class="row">
          <span>{{ a.label }}</span>
          <span>
            <button @click="listen(a.key, a.positions)">{{ bindingLabel(a.key) }}</button>
            <button
              v-if="radio.switches[a.key]"
              title="Unassign"
              @click="delete radio.switches[a.key]"
            >
              ✕
            </button>
          </span>
        </div>
      </div>
    </template>

    <template v-else-if="gamepad">
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
              <select v-model.number="gamepad.axes[g].index">
                <option :value="-1">—</option>
                <option v-for="(_, i) in rawAxes" :key="i" :value="i">Axis {{ i }}</option>
              </select>
            </td>
            <td><input v-model="gamepad.axes[g].invert" type="checkbox" /></td>
            <td>
              <div class="meter">
                <div :style="{ left: `${50 + value(gamepad.axes[g], gamepad.deadzone) * 50}%` }" />
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
        <select v-model="gamepad.throttleStyle">
          <option value="absolute">Non-centring</option>
          <option value="incremental">Self-centring (push to add power)</option>
        </select>
      </label>
      <label>
        <span
          >Deadzone <b>{{ Math.round(gamepad.deadzone * 100) }}%</b></span
        >
        <input v-model.number="gamepad.deadzone" type="range" min="0" max="0.2" step="0.01" />
      </label>

      <div class="buttons">
        <div v-for="a in actions" :key="a.key" class="row">
          <span>{{ a.label }}</span>
          <button @click="listen(a.key, a.positions)">{{ bindingLabel(a.key) }}</button>
        </div>
      </div>
    </template>

    <details>
      <summary>Keyboard</summary>
      <p class="muted">
        Arrows: aileron and elevator · A/D: rudder · W/S: throttle · hold Shift for fine control · F
        flaps · E rates · H throttle hold · trims I/K elevator, J/L aileron, U/O rudder · R reset ·
        T air start · C camera · P pause · G aero overlay. Q walk mode: W/A/S/D walk the pilot round
        the field instead of flying throttle and rudder, Shift runs, the arrows still fly · B back
        to the pilot station.
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
.probe {
  margin: 0;
  font-size: 12px;
}
.probe a {
  color: var(--accent);
}
.check {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: 13px;
}
.check input {
  margin-top: 3px;
}
.wizard {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 13px;
}
.wizard p {
  margin: 0;
}
.warn {
  color: var(--warn);
  margin: 0;
  padding-left: 18px;
}
</style>
