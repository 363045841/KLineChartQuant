/** 结构、区域和成交分布的专用投影，不把领域数据转换成数值 Plot。 */

import type { IndicatorRenderStateComposer } from './indicatorMetadata.js'
import { readIndicatorSeriesEntry } from './indicatorMetadata.js'
import type { StructureRenderState } from './state/structureState.js'
import type { ZonesRenderState } from './state/zonesState.js'

/** 结构与区域使用单位范围，领域坐标由专用渲染器解释。 */
function composeUnitState(series: unknown, params: unknown, timestamp: number) {
  return {
    timestamp,
    series,
    params,
    valueMin: 0,
    valueMax: 1,
    visibleMin: 0,
    visibleMax: 1,
  }
}

/** 结构事件不是逐 bar 数组，只投影其明确声明的索引字段。 */
export const composeStructureState: IndicatorRenderStateComposer = (entry, _range, timestamp, projectIndex) => {
  const source = readIndicatorSeriesEntry<Pick<StructureRenderState, 'series' | 'params'>>(entry, 'structure')
  const series = {
    ...source.series,
    swings: source.series.swings.map((swing) => ({ ...swing, index: projectIndex(swing.index) })).filter((swing) => Number.isFinite(swing.index)),
    events: source.series.events.map((event) => ({ ...event, index: projectIndex(event.index), brokenSwingIndex: projectIndex(event.brokenSwingIndex) }))
      .filter((event) => Number.isFinite(event.index) && Number.isFinite(event.brokenSwingIndex)),
  }
  return composeUnitState(series, source.params, timestamp)
}

/** 区域只投影起止 bar，仍保留未结束区域的开放终点。 */
export const composeZonesState: IndicatorRenderStateComposer = (entry, _range, timestamp, projectIndex) => {
  const source = readIndicatorSeriesEntry<Pick<ZonesRenderState, 'series' | 'params'>>(entry, 'zones')
  const series = source.series.map((zone) => ({ ...zone,
    startIndex: projectIndex(zone.startIndex),
    endIndex: zone.endIndex === undefined ? undefined : projectIndex(zone.endIndex),
  })).filter((zone) => Number.isFinite(zone.startIndex) && (zone.endIndex === undefined || Number.isFinite(zone.endIndex)))
  return composeUnitState(series, source.params, timestamp)
}

/** 成交分布按价格分箱计算范围，不按 K 线下标计算。 */
export const composeVolumeProfileState: IndicatorRenderStateComposer = (
  entry,
  _range,
  timestamp,
) => {
  const source = readIndicatorSeriesEntry<{
    series: { bins: { priceLow: number; priceHigh: number }[]; val: number; vah: number }
    params: unknown
  }>(entry, 'volumeProfile')
  const bins = source.series.bins
  return {
    timestamp,
    series: source.series,
    params: source.params,
    valueMin: bins[0]?.priceLow ?? 0,
    valueMax: bins[bins.length - 1]?.priceHigh ?? 1,
    visibleMin: source.series.val,
    visibleMax: source.series.vah,
  }
}
