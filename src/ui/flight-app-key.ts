import type { InjectionKey } from 'vue'
import type { FlightApp } from '../app/flight-app'

/** The running FlightApp, for settings tabs that drive it; null until it has started. */
export const flightAppKey: InjectionKey<() => FlightApp | null> = Symbol('flightApp')
