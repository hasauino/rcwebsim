<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useFlight, type HistoryPoint } from '../stores/flight'

const { history } = storeToRefs(useFlight())
const canvas = ref<HTMLCanvasElement | null>(null)

const series: { key: keyof HistoryPoint; label: string; unit: string; color: string }[] = [
  { key: 'airspeed', label: 'Airspeed', unit: 'm/s', color: '#f5a524' },
  { key: 'alpha', label: 'Alpha', unit: '°', color: '#4fc3f7' },
  { key: 'altitude', label: 'Height', unit: 'm', color: '#3ddc84' },
  { key: 'load', label: 'Load', unit: 'G', color: '#ff7ab6' },
]

function draw() {
  const c = canvas.value
  if (!c) return
  const dpr = window.devicePixelRatio || 1
  const w = c.clientWidth
  const h = c.clientHeight
  c.width = w * dpr
  c.height = h * dpr
  const g = c.getContext('2d')!
  g.scale(dpr, dpr)
  g.clearRect(0, 0, w, h)
  const points = history.value
  if (points.length < 2) return
  const t0 = points[0]!.t
  const t1 = points[points.length - 1]!.t
  const rowH = h / series.length
  series.forEach((s, row) => {
    const values = points.map((p) => p[s.key] as number)
    let lo = Math.min(...values)
    let hi = Math.max(...values)
    if (hi - lo < 1) {
      hi += 0.5
      lo -= 0.5
    }
    const y0 = row * rowH
    g.strokeStyle = 'rgba(240,246,252,0.08)'
    g.beginPath()
    g.moveTo(0, y0 + rowH - 0.5)
    g.lineTo(w, y0 + rowH - 0.5)
    g.stroke()
    g.strokeStyle = s.color
    g.lineWidth = 1.5
    g.beginPath()
    points.forEach((p, i) => {
      const x = ((p.t - t0) / Math.max(t1 - t0, 1e-3)) * w
      const y = y0 + 6 + (1 - ((p[s.key] as number) - lo) / (hi - lo)) * (rowH - 18)
      if (i === 0) g.moveTo(x, y)
      else g.lineTo(x, y)
    })
    g.stroke()
    g.fillStyle = '#8b949e'
    g.font = '11px system-ui, sans-serif'
    g.fillText(`${s.label} ${values[values.length - 1]!.toFixed(1)} ${s.unit}`, 6, y0 + rowH - 6)
  })
}

onMounted(draw)
watch(history, draw)
</script>

<template>
  <div class="graphs panel">
    <canvas ref="canvas" />
  </div>
</template>

<style scoped>
.graphs {
  position: absolute;
  left: 16px;
  top: 16px;
  width: min(320px, calc(100% - 32px));
  height: 240px;
  padding: 6px;
}
/* With touch sticks the gauges take the top-left corner. */
.graphs.touch {
  left: auto;
  right: 16px;
  top: 64px;
  height: 130px;
}
@media (orientation: portrait) {
  .graphs.touch {
    top: 200px;
  }
}
canvas {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
