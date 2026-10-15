<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { useFlight } from '../stores/flight'
import type { StickSide, SwitchAction } from '../input/devices'
import { MODE_LAYOUT, type Gimbal, type StickChannel, type StickMode } from '../input/transmitter'

const props = defineProps<{ mode: StickMode }>()
const emit = defineEmits<{
  touchDown: [side: StickSide]
  touchMove: [side: StickSide, dx: number, dy: number]
  touchUp: [side: StickSide]
  switch: [action: SwitchAction]
  airStart: []
  pause: []
}>()

const flight = useFlight()
const { transmitter: tx, status } = storeToRefs(flight)

/** Finger travel for full stick throw, as a fraction of the pad's width. */
const FULL_THROW = 0.4
const SIDES: StickSide[] = ['left', 'right']
const NAMES: Record<StickChannel, string> = {
  aileron: 'Aileron',
  elevator: 'Elevator',
  rudder: 'Rudder',
  throttle: 'Throttle',
}

const labels = computed(() => {
  const byGimbal = Object.fromEntries(
    Object.entries(MODE_LAYOUT[props.mode]).map(([channel, g]) => [g, channel]),
  ) as Record<Gimbal, StickChannel>
  return {
    left: `${NAMES[byGimbal.leftY]} · ${NAMES[byGimbal.leftX]}`,
    right: `${NAMES[byGimbal.rightY]} · ${NAMES[byGimbal.rightX]}`,
  }
})
const flapLabel = computed(() => ['Up', 'Half', 'Full'][tx.value?.flapSwitch ?? 0])
const stick = (side: StickSide, axis: 'X' | 'Y') => tx.value?.sticks[`${side}${axis}`] ?? 0

/** One finger per pad; the spot it lands on is the stick's centre. */
const fingers: Partial<Record<StickSide, { id: number; x: number; y: number; throw: number }>> = {}

function down(side: StickSide, e: PointerEvent) {
  if (fingers[side]) return
  const pad = e.currentTarget as HTMLElement
  pad.setPointerCapture(e.pointerId)
  fingers[side] = {
    id: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    throw: pad.clientWidth * FULL_THROW,
  }
  emit('touchDown', side)
}

function move(side: StickSide, e: PointerEvent) {
  const f = fingers[side]
  if (f?.id !== e.pointerId) return
  emit('touchMove', side, (e.clientX - f.x) / f.throw, (e.clientY - f.y) / f.throw)
}

function up(side: StickSide, e: PointerEvent) {
  if (fingers[side]?.id !== e.pointerId) return
  delete fingers[side]
  emit('touchUp', side)
}

// Hidden mid-flight (settings opened, keyboard took over): let go of the sticks.
onBeforeUnmount(() => {
  for (const side of SIDES) if (fingers[side]) emit('touchUp', side)
})
</script>

<template>
  <div class="touch-controls">
    <div
      v-for="side in SIDES"
      :key="side"
      :class="['pad', side]"
      @pointerdown="down(side, $event)"
      @pointermove="move(side, $event)"
      @pointerup="up(side, $event)"
      @pointercancel="up(side, $event)"
      @lostpointercapture="up(side, $event)"
      @contextmenu.prevent
    >
      <span class="label">{{ labels[side] }}</span>
      <div
        class="knob"
        :style="{
          left: `${50 + stick(side, 'X') * 42}%`,
          top: `${50 + stick(side, 'Y') * 42}%`,
        }"
      />
    </div>

    <div class="buttons">
      <button class="panel" :class="{ on: !tx?.highRates }" @click="emit('switch', 'rates')">
        {{ tx?.highRates ? 'High' : 'Low' }} rates
      </button>
      <button
        class="panel"
        :class="{ on: (tx?.flapSwitch ?? 0) > 0 }"
        @click="emit('switch', 'flaps')"
      >
        Flaps {{ flapLabel }}
      </button>
      <button
        class="panel"
        :class="{ warn: tx?.throttleHold }"
        @click="emit('switch', 'throttleHold')"
      >
        {{ tx?.throttleHold ? 'Hold on' : 'Hold off' }}
      </button>
      <button class="panel" @click="emit('switch', 'camera')">Camera</button>
      <button class="panel" @click="emit('pause')">
        {{ status === 'paused' ? 'Resume' : 'Pause' }}
      </button>
      <button class="panel" @click="emit('switch', 'reset')">Runway</button>
      <button class="panel" @click="emit('airStart')">Air start</button>
    </div>
  </div>
</template>

<style scoped>
.touch-controls {
  position: absolute;
  inset: auto 0 0 0;
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-areas: 'left buttons right';
  align-items: end;
  gap: 20px 12px;
  padding: 16px;
  pointer-events: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
.touch-controls > * {
  pointer-events: auto;
}
.pad {
  position: relative;
  width: min(40vmin, 200px);
  aspect-ratio: 1;
  border-radius: 18px;
  border: 1px solid var(--border);
  background:
    linear-gradient(var(--border), var(--border)) center / 1px 84% no-repeat,
    linear-gradient(var(--border), var(--border)) center / 84% 1px no-repeat,
    rgba(13, 17, 23, 0.35);
  touch-action: none;
}
.pad.left {
  grid-area: left;
}
.pad.right {
  grid-area: right;
}
.label {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  right: 0;
  white-space: nowrap;
  text-align: center;
  font-size: 10px;
  color: var(--text);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  pointer-events: none;
}
.knob {
  position: absolute;
  width: 26%;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: rgba(245, 165, 36, 0.85);
  box-shadow: 0 0 0 3px rgba(245, 165, 36, 0.25);
  /* Snapshots arrive at ~15 Hz; glide between them. */
  transition:
    left 66ms linear,
    top 66ms linear;
  pointer-events: none;
}
.buttons {
  grid-area: buttons;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-content: end;
  gap: 8px;
}
.buttons button {
  min-height: 40px;
  min-width: 72px;
  padding: 6px 10px;
  font-size: 13px;
  touch-action: manipulation;
}
.buttons .on {
  color: var(--accent);
}
.buttons .warn {
  color: var(--bad);
  font-weight: 600;
}
@media (orientation: portrait) {
  .touch-controls {
    grid-template-columns: auto 1fr auto;
    grid-template-areas:
      'buttons buttons buttons'
      'left . right';
  }
}
</style>
