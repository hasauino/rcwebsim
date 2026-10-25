<script setup lang="ts">
import { shallowRef } from 'vue'
import { useSettings } from '../stores/settings'
import type { AircraftSpec } from '../sim/aircraft/types'
import FlightView from './FlightView.vue'
import HangarView from './HangarView.vue'

const { settings } = useSettings()
/** The aircraft in flight; null while the pilot is in the hangar. */
const flying = shallowRef<AircraftSpec | null>(null)

/** Remembers the choice at once, so a reload in the hangar keeps it. */
function choose(aircraft: AircraftSpec) {
  settings.aircraft = aircraft.id
}
function fly(aircraft: AircraftSpec) {
  choose(aircraft)
  flying.value = aircraft
}
</script>

<template>
  <FlightView v-if="flying" :key="flying.id" :aircraft="flying" @hangar="flying = null" />
  <HangarView v-else :selected="settings.aircraft" @choose="choose" @fly="fly" />
</template>
