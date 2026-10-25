<script setup lang="ts">
import { AIRCRAFT } from '../sim/aircraft'
import { PROPS, SURFACES } from '../render/hangar/props'

const hangar = Object.values({ ...PROPS, ...SURFACES })
const attributed = hangar.filter((c) => c.license !== 'CC0')
const publicDomain = hangar.filter((c) => c.license === 'CC0')
</script>

<template>
  <div class="credits">
    <p v-for="a in AIRCRAFT" :key="a.id">
      <strong>{{ a.model.credit.title }}</strong> 3D model by {{ a.model.credit.author }},
      <a :href="a.model.credit.url" target="_blank" rel="noopener">source</a>, licensed
      {{ a.model.credit.license }}.
    </p>
    <h4>Hangar</h4>
    <p>
      <template v-for="(c, i) in attributed" :key="c.url">
        <a :href="c.url" target="_blank" rel="noopener">{{ c.title }}</a> by {{ c.author }} ({{
          c.license
        }}){{ i < attributed.length - 1 ? '; ' : '. ' }}
      </template>
      Logos painted out, resized and recompressed for the web.
    </p>
    <p>
      From Poly Haven (CC0):
      <template v-for="(c, i) in publicDomain" :key="c.url">
        <a :href="c.url" target="_blank" rel="noopener">{{ c.title }}</a> by {{ c.author
        }}{{ i < publicDomain.length - 1 ? ', ' : '.' }}
      </template>
    </p>
    <h4>Field</h4>
    <p>Sky HDRI and grass texture from Poly Haven (CC0). Trees from Kenney's Nature Kit (CC0).</p>
    <p>
      Airfoil coordinates from the UIUC Airfoil Coordinates Database; polars generated with XFoil.
    </p>
    <p>Physics: Rapier. Rendering: three.js.</p>
  </div>
</template>

<style scoped>
.credits {
  line-height: 1.6;
}
.credits a {
  color: var(--accent);
}
h4 {
  margin: 14px 0 0;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}
</style>
