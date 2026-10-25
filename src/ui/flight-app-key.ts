import type { InjectionKey } from 'vue'
import type { FlightApp } from '../app/flight-app'
import type { AircraftSpec } from '../sim/aircraft/types'

/** The running FlightApp, for settings tabs that drive it; null until it has started. */
export const flightAppKey: InjectionKey<() => FlightApp | null> = Symbol('flightApp')

/** The aircraft being flown, for the settings tabs that depend on it. */
export const aircraftKey: InjectionKey<AircraftSpec> = Symbol('aircraft')
