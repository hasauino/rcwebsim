<script setup lang="ts">
import { shallowRef } from 'vue'
import { useSettings } from '../stores/settings'
import type { AircraftSpec } from '../sim/aircraft/types'
import FlightView from './FlightView.vue'
import StartScreen from './StartScreen.vue'

const { settings } = useSettings()
/** The aircraft in flight; null while the start screen is up. */
const flying = shallowRef<AircraftSpec | null>(null)

function fly(aircraft: AircraftSpec) {
  settings.aircraft = aircraft.id
  flying.value = aircraft
}
</script>

<template>
  <FlightView v-if="flying" :key="flying.id" :aircraft="flying" @change-aircraft="flying = null" />
  <StartScreen v-else :selected="settings.aircraft" @fly="fly" />
</template>
