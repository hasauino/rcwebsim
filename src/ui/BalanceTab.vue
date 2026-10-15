<script setup lang="ts">
import { computed, ref } from 'vue'
import { cgFor, useSettings } from '../stores/settings'
import { pa18 } from '../sim/aircraft/pa18'
import { balance, meanChord, neutralPoint, type BalanceVerdict } from '../sim/balance'
import sideView from './side-views/pa18.json'

const { settings } = useSettings()
const aircraft = pa18
const mm = (metres: number) => Math.round(metres * 1000)

const np = neutralPoint(aircraft)
const [front, back] = aircraft.cgRange
const chord = aircraft.surfaces[0]!.rootChord
const cgHeight = -aircraft.centerOfGravity[1] * 1000
/** Slider travel: well ahead of the manual's range to past the lift point. */
const min = mm(front) - 40
const max = mm(np) + 20

/** The CG in whole millimetres behind the leading edge, as the tab shows it. */
const cgMm = computed({
  get: () => mm(cgFor(settings, aircraft)),
  set: (value: number) => {
    settings.cg[aircraft.id] = Math.min(max, Math.max(min, Math.round(value))) / 1000
  },
})
const judged = computed(() => balance(aircraft, cgMm.value / 1000))

/** A fresh airframe: a new seed draws new build tolerances. */
const newSeed = () => Math.floor(Math.random() * 2 ** 31)
const needsTrimming = computed({
  get: () => settings.builds[aircraft.id]?.needsTrimming ?? false,
  set: (on: boolean) => {
    settings.builds[aircraft.id] = {
      needsTrimming: on,
      seed: settings.builds[aircraft.id]?.seed ?? newSeed(),
    }
  },
})
const buildNew = () => (settings.builds[aircraft.id] = { needsTrimming: true, seed: newSeed() })

const presets = [
  { label: 'Nose heavy', value: mm(front) - 15 },
  { label: 'Centered', value: mm(aircraft.centerOfGravity[2]) },
  { label: 'Tail heavy', value: Math.round((mm(back) + mm(np)) / 2) },
]

const verdicts: Record<BalanceVerdict, { label: string; tone: string; hint: string }> = {
  noseHeavy: {
    label: 'Nose heavy',
    tone: 'warn',
    hint: 'Very stable, but needs more up elevator: it glides fast and is hard to flare.',
  },
  centered: {
    label: 'Centered',
    tone: 'good',
    hint: `Within the manual's ${mm(front)}–${mm(back)} mm: stable, with a crisp elevator.`,
  },
  tailHeavy: {
    label: 'Tail heavy',
    tone: 'warn',
    hint: 'Twitchy in pitch: it glides slowly and stalls more easily.',
  },
  unstable: {
    label: 'Unflyable',
    tone: 'bad',
    hint: 'The CG is behind the lift point: no elevator setting holds a steady attitude.',
  },
}
const verdict = computed(() => verdicts[judged.value.verdict])

// Side view in body-frame millimetres (x aft of the datum, y down).
const { x, y, width, height } = sideView.bounds
const viewBox = `${x - 20} ${y - 20} ${width + 40} ${height + 40}`
const ticks = Array.from({ length: Math.floor(mm(chord) / 25) + 1 }, (_, i) => i * 25)

// Dragging the CG roundel along the chord.
const svg = ref<SVGSVGElement | null>(null)
const dragging = ref(false)
function toBodyMm(e: PointerEvent): number {
  const matrix = svg.value!.getScreenCTM()!.inverse()
  return new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix).x
}
function startDrag(e: PointerEvent) {
  dragging.value = true
  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
}
function drag(e: PointerEvent) {
  if (dragging.value) cgMm.value = toBodyMm(e)
}
function nudge(e: KeyboardEvent) {
  const step = e.shiftKey ? 5 : 1
  if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') cgMm.value -= step
  else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') cgMm.value += step
  else return
  e.preventDefault()
}
</script>

<template>
  <div class="balance">
    <p class="hint">
      Drag the CG along the wing, as if sliding the battery in its bay. RC manuals give the balance
      point as a distance behind the wing's leading edge.
    </p>

    <svg
      ref="svg"
      class="view"
      :class="[verdict.tone, { dragging }]"
      :viewBox="viewBox"
      role="img"
      aria-label="Side view of the aircraft with its lift point and centre of gravity"
    >
      <path class="airframe" :d="sideView.path" fill-rule="evenodd" />

      <!-- Manual's recommended range. -->
      <rect
        class="range"
        :x="mm(front)"
        :y="-60"
        :width="Math.max(mm(back) - mm(front), 2)"
        :height="cgHeight + 60"
      />

      <!-- Wing chord, ticked every 25 mm from the leading edge. -->
      <line class="chord" x1="0" y1="0" :x2="mm(chord)" y2="0" />
      <line
        v-for="t in ticks"
        :key="t"
        class="tick"
        :x1="t"
        :y1="t % 50 ? -5 : -9"
        :x2="t"
        :y2="t % 50 ? 5 : 9"
      />

      <!-- Lift point: the neutral point, where the lift change acts. -->
      <g class="lift">
        <line :x1="mm(np)" y1="0" :x2="mm(np)" y2="-56" />
        <path :d="`M${mm(np) - 10} -50 L${mm(np)} -68 L${mm(np) + 10} -50 Z`" />
        <text :x="mm(np)" y="-100">Lift point</text>
        <text class="sub" :x="mm(np)" y="-76">neutral point</text>
      </g>

      <!-- CG: draggable balance roundel with its weight arrow. -->
      <g
        class="cg"
        role="slider"
        tabindex="0"
        aria-label="Centre of gravity, mm behind the leading edge"
        :aria-valuemin="min"
        :aria-valuemax="max"
        :aria-valuenow="cgMm"
        :aria-valuetext="`${cgMm} mm, ${verdict.label}`"
        @keydown="nudge"
        @pointerdown="startDrag"
        @pointermove="drag"
        @pointerup="dragging = false"
        @pointercancel="dragging = false"
      >
        <line class="guide" :x1="cgMm" y1="0" :x2="cgMm" :y2="cgHeight" />
        <line :x1="cgMm" :y1="cgHeight" :x2="cgMm" :y2="cgHeight + 50" />
        <path
          :d="`M${cgMm - 10} ${cgHeight + 44} L${cgMm} ${cgHeight + 62} L${cgMm + 10} ${cgHeight + 44} Z`"
        />
        <circle class="hit" :cx="cgMm" :cy="cgHeight" r="40" />
        <circle class="disc" :cx="cgMm" :cy="cgHeight" r="17" />
        <path
          class="quarters"
          :d="`M${cgMm} ${cgHeight} V${cgHeight - 17} A17 17 0 0 1 ${cgMm + 17} ${cgHeight} Z M${cgMm} ${cgHeight} V${cgHeight + 17} A17 17 0 0 1 ${cgMm - 17} ${cgHeight} Z`"
        />
        <text :x="cgMm" :y="cgHeight + 90">CG</text>
      </g>
    </svg>

    <div class="readout">
      <div>
        <div class="figure">
          <b>{{ cgMm }} mm</b> behind the leading edge
          <span class="muted"
            >({{ Math.round((cgMm / 1000 / meanChord(aircraft)) * 100) }}% chord)</span
          >
        </div>
        <div class="muted">
          Lift point {{ mm(np) }} mm · manual {{ mm(front) }}–{{ mm(back) }} mm · stability margin
          {{ Math.round(judged.staticMargin * 100) }}%
        </div>
      </div>
      <span class="chip" :class="verdict.tone">{{ verdict.label }}</span>
    </div>
    <p class="hint">
      {{ verdict.hint }} A plane flies with its CG a little ahead of the lift point; at or behind
      it, the plane cannot be flown.
    </p>

    <input
      v-model.number="cgMm"
      type="range"
      :min="min"
      :max="max"
      step="1"
      aria-label="Centre of gravity, mm behind the leading edge"
    />
    <div class="presets">
      <button
        v-for="p in presets"
        :key="p.label"
        :class="{ active: p.value === cgMm }"
        @click="cgMm = p.value"
      >
        {{ p.label }} <small>{{ p.value }} mm</small>
      </button>
    </div>
    <p class="hint">Moving the CG does not change the weight, and takes effect straight away.</p>

    <label class="check">
      <input v-model="needsTrimming" type="checkbox" />
      <span>
        <b>Airframe needs trimming.</b> Like a model off the building board, the control surfaces
        sit a little off neutral, so a hands-off plane drifts until you trim it out in flight. The
        same airframe stays, with its trims, until you build a new one.
      </span>
    </label>
    <button v-if="needsTrimming" class="new-build" @click="buildNew">Build a new airframe</button>
  </div>
</template>

<style scoped>
.balance {
  display: grid;
  gap: 12px;
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
.check b {
  color: inherit;
}
.new-build {
  justify-self: start;
}
.hint,
.muted {
  color: var(--muted);
  font-size: 12px;
  margin: 0;
}
.view {
  width: 100%;
  height: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: rgba(240, 246, 252, 0.03);
  user-select: none;
  --tone: var(--good);
}
.view.warn {
  --tone: var(--warn);
}
.view.bad {
  --tone: var(--bad);
}
.airframe {
  fill: rgba(240, 246, 252, 0.13);
  stroke: rgba(240, 246, 252, 0.25);
  stroke-width: 1.5;
}
.range {
  fill: rgba(61, 220, 132, 0.18);
}
.chord,
.tick {
  stroke: var(--text);
  stroke-width: 2.5;
}
.lift line {
  stroke: #58a6ff;
  stroke-width: 4;
}
.lift path {
  fill: #58a6ff;
}
text {
  font-size: 26px;
  font-weight: 600;
  text-anchor: middle;
}
.lift text {
  fill: #58a6ff;
}
.lift text.sub {
  font-size: 20px;
  font-weight: 500;
}
.cg line {
  stroke: var(--tone);
  stroke-width: 4;
}
.cg line.guide {
  stroke-dasharray: 8 6;
  stroke-width: 2;
}
.cg path {
  fill: var(--tone);
}
.cg text {
  fill: var(--tone);
}
.cg {
  cursor: ew-resize;
  touch-action: none;
}
.cg .hit {
  fill: transparent;
}
.cg .disc {
  fill: #f0f6fc;
  stroke: #0d1117;
  stroke-width: 2.5;
}
.cg path.quarters {
  fill: #0d1117;
}
.cg:focus {
  outline: none;
}
.cg:focus-visible .disc {
  stroke: var(--accent);
  stroke-width: 5;
}
.readout {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.figure b {
  color: var(--accent);
  font-weight: 600;
}
.chip {
  flex: none;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid currentColor;
}
.chip.good {
  color: var(--good);
}
.chip.warn {
  color: var(--warn);
}
.chip.bad {
  color: var(--bad);
}
.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.presets button.active {
  background: rgba(245, 165, 36, 0.15);
  border-color: rgba(245, 165, 36, 0.4);
  color: var(--accent);
}
.presets small {
  color: var(--muted);
  font-family: var(--mono);
  margin-left: 4px;
}
</style>
