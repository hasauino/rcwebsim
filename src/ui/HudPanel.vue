<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useFlight } from '../stores/flight'
import { useSettings } from '../stores/settings'

/**
 * `fullscreen` is null where the browser can't go fullscreen. With
 * `touchSticks` the sticks fill the bottom corners, so the gauges move up.
 */
defineProps<{
  showHelp: boolean
  fullscreen: boolean | null
  touchSticks: boolean
  /** The aircraft has flaps, so the flap switch does something. */
  flaps: boolean
}>()
defineEmits<{ settings: []; fullscreen: [] }>()

const flight = useFlight()
const { telemetry: t, channels, transmitter: tx, radioIsTransmitter } = storeToRefs(flight)
const { settings } = useSettings()

const kmh = computed(() => ((t.value?.airspeed ?? 0) * 3.6).toFixed(0))
const battery = computed(() => Math.round((t.value?.batteryLevel ?? 1) * 100))
const flapLabel = computed(() => ['UP', 'HALF', 'FULL'][tx.value?.flapSwitch ?? 0])
const windArrow = computed(() => {
  // Arrow points where the wind blows to, relative to north-up.
  const w = t.value?.wind
  if (!w || Math.hypot(w.x, w.z) < 0.2) return null
  return { rotate: (Math.atan2(w.x, -w.z) * 180) / Math.PI, speed: Math.hypot(w.x, w.z) }
})
const stick = (g: 'leftX' | 'leftY' | 'rightX' | 'rightY') => tx.value?.sticks[g] ?? 0
</script>

<template>
  <div class="hud" :class="{ touch: touchSticks }">
    <div class="cluster panel">
      <div class="gauge">
        <span class="label">Airspeed</span>
        <span class="value">{{ kmh }}<small>km/h</small></span>
      </div>
      <div class="gauge">
        <span class="label">Height</span>
        <span class="value">{{ (t?.altitude ?? 0).toFixed(0) }}<small>m</small></span>
      </div>
      <div class="gauge">
        <span class="label">Climb</span>
        <span class="value">{{ (t?.verticalSpeed ?? 0).toFixed(1) }}<small>m/s</small></span>
      </div>
      <div class="gauge">
        <span class="label">Load</span>
        <span class="value">{{ (t?.loadFactor ?? 1).toFixed(1) }}<small>G</small></span>
      </div>
      <div class="gauge">
        <span class="label">Battery</span>
        <span class="value" :class="{ low: battery < 25 }"
          >{{ (t?.voltage ?? 0).toFixed(1) }}<small>V · {{ battery }}%</small></span
        >
      </div>
      <div class="throttle">
        <span class="label">Throttle</span>
        <div class="bar"><div :style="{ width: `${(channels?.throttle ?? 0) * 100}%` }" /></div>
        <span class="mono"
          >{{ (t?.rpm ?? 0).toFixed(0) }} rpm · {{ (t?.current ?? 0).toFixed(0) }} A</span
        >
      </div>
    </div>

    <!-- A radio's sticks are in the pilot's hands; the sim only sees its channels. -->
    <div v-if="!touchSticks && !radioIsTransmitter" class="sticks panel">
      <div v-for="side in ['left', 'right'] as const" :key="side" class="gimbal">
        <div
          class="dot"
          :style="{
            left: `${50 + stick(`${side}X`) * 42}%`,
            top: `${50 + stick(`${side}Y`) * 42}%`,
          }"
        />
      </div>
      <div class="switches">
        <span :class="{ on: !tx?.highRates }">{{ tx?.highRates ? 'HI' : 'LO' }} rates</span>
        <span v-if="flaps" :class="{ on: (tx?.flapSwitch ?? 0) > 0 }">Flaps {{ flapLabel }}</span>
        <span :class="{ warn: tx?.throttleHold }">{{ tx?.throttleHold ? 'HOLD' : 'Armed' }}</span>
      </div>
    </div>

    <div class="topbar">
      <div v-if="windArrow" class="wind panel" title="Wind at the aircraft">
        <span class="arrow" :style="{ transform: `rotate(${windArrow.rotate}deg)` }">↑</span>
        {{ windArrow.speed.toFixed(1) }} m/s
      </div>
      <span class="chip panel">{{
        flight.walking ? 'Walking' : settings.camera.mode === 'pilot' ? 'Pilot view' : 'Chase view'
      }}</span>
      <button
        v-if="fullscreen !== null"
        class="panel"
        :title="fullscreen ? 'Exit full screen (V)' : 'Full screen (V)'"
        @mousedown.prevent
        @click="$emit('fullscreen')"
      >
        {{ fullscreen ? 'Exit full screen' : 'Full screen' }}
      </button>
      <button class="panel" title="Settings (Esc)" @click="$emit('settings')">⚙ Settings</button>
    </div>

    <div v-if="showHelp" class="help panel">
      <div><kbd>W</kbd>/<kbd>S</kbd> throttle · <kbd>←</kbd><kbd>→</kbd> aileron</div>
      <div>
        <kbd>↑</kbd><kbd>↓</kbd> elevator · <kbd>A</kbd>/<kbd>D</kbd> rudder · <kbd>Shift</kbd> fine
      </div>
      <!-- With a radio as the transmitter, its own switches and trims do these. -->
      <div v-if="!radioIsTransmitter">
        <template v-if="flaps"><kbd>F</kbd> flaps · </template><kbd>E</kbd> rates ·
        <kbd>H</kbd> throttle hold
      </div>
      <div v-if="!radioIsTransmitter">
        Trims: <kbd>I</kbd>/<kbd>K</kbd> elev · <kbd>J</kbd>/<kbd>L</kbd> ail · <kbd>U</kbd>/<kbd
          >O</kbd
        >
        rud
      </div>
      <div>
        <kbd>R</kbd> runway · <kbd>T</kbd> air start · <kbd>Y</kbd> hand launch ·
        <kbd>C</kbd> camera · <kbd>V</kbd> full screen
      </div>
      <div>
        <kbd>Q</kbd> walk mode: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk,
        <kbd>Shift</kbd> run · <kbd>B</kbd> back to pilot station
      </div>
      <div>
        <kbd>P</kbd> pause · <kbd>G</kbd> aero overlay · <kbd>Esc</kbd> settings · <kbd>/</kbd> hide
      </div>
    </div>
  </div>
</template>

<style scoped>
.hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.hud > * {
  pointer-events: auto;
}
.cluster {
  position: absolute;
  left: 16px;
  bottom: 16px;
  display: grid;
  grid-template-columns: repeat(5, auto);
  gap: 4px 18px;
  padding: 10px 14px;
  max-width: calc(100% - 32px);
}
.gauge {
  display: flex;
  flex-direction: column;
}
.label {
  font-size: 11px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.value {
  font-family: var(--mono);
  font-size: 20px;
  font-variant-numeric: tabular-nums;
}
.value small {
  font-size: 11px;
  color: var(--muted);
  margin-left: 3px;
}
.value.low {
  color: var(--bad);
}
.throttle {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: center;
}
.bar {
  height: 6px;
  background: rgba(240, 246, 252, 0.1);
  border-radius: 3px;
  overflow: hidden;
}
.bar div {
  height: 100%;
  background: var(--accent);
}
.mono {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--muted);
}
.sticks {
  position: absolute;
  right: 16px;
  bottom: 16px;
  display: grid;
  grid-template-columns: 64px 64px;
  gap: 8px;
  padding: 10px;
}
.gimbal {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 8px;
  background:
    linear-gradient(var(--border), var(--border)) center / 1px 100% no-repeat,
    linear-gradient(var(--border), var(--border)) center / 100% 1px no-repeat,
    rgba(240, 246, 252, 0.04);
}
.dot {
  position: absolute;
  width: 10px;
  height: 10px;
  margin: -5px 0 0 -5px;
  border-radius: 50%;
  background: var(--accent);
}
.switches {
  grid-column: 1 / -1;
  display: flex;
  justify-content: space-between;
  gap: 6px;
  font-size: 11px;
  color: var(--muted);
}
.switches .on {
  color: var(--accent);
}
.switches .warn {
  color: var(--bad);
  font-weight: 600;
}
.topbar {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  gap: 8px;
  align-items: center;
}
.chip,
.wind {
  padding: 6px 10px;
  font-size: 12px;
}
.arrow {
  display: inline-block;
  color: var(--accent);
  font-weight: 700;
}
.help {
  position: absolute;
  top: 60px;
  right: 16px;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 2;
  color: var(--muted);
}
.touch .cluster {
  top: 16px;
  bottom: auto;
  grid-template-columns: repeat(3, auto);
  gap: 2px 14px;
  padding: 8px 12px;
}
.touch .value {
  font-size: 16px;
}
@media (orientation: portrait) {
  .touch .cluster {
    top: 64px;
  }
}
@media (max-width: 720px) {
  .cluster {
    grid-template-columns: repeat(3, auto);
  }
  .help {
    display: none;
  }
}
</style>
