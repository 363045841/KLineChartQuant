/** 指标身份契约：领域输出保留明确的专用类型。 */
import type { StructureRenderState } from './state/structureState.js'
import type { VolumeProfileRenderState } from './state/volumeProfileState.js'
import type { ZonesRenderState } from './state/zonesState.js'

/** 第三方仍可通过 declaration merging 扩展指标身份。 */
export interface IndicatorStateContracts {
  structure: StructureRenderState
  volumeProfile: VolumeProfileRenderState
  zones: ZonesRenderState
}

export interface AuxiliaryIndicatorContracts {
  volume: unknown
  timeShare: unknown
  fiveDayTimeShare: unknown
  lastPriceLine: unknown
  lastPriceLabelRegistrar: unknown
  extremaMarkers: unknown
}

export type IndicatorStateName = keyof IndicatorStateContracts
export type BuiltinIndicatorName = IndicatorStateName | keyof AuxiliaryIndicatorContracts
export type IndicatorName = BuiltinIndicatorName | (string & {})
export type IndicatorRenderEntry<S> = Pick<S, Extract<keyof S, 'series' | 'params'>>
export type IndicatorRenderEntryOf<K extends IndicatorStateName> = IndicatorRenderEntry<
  IndicatorStateContracts[K]
>
