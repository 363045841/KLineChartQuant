/** 结构、区域和成交分布的专用投影，不把领域数据转换成数值 Plot。 */

import type { IndicatorRenderStateComposer } from './indicatorMetadata.js'
import { readIndicatorSeriesEntry } from './indicatorMetadata.js'

/** 结构与区域使用单位范围，领域坐标由专用渲染器解释。 */
export const composeUnitState: IndicatorRenderStateComposer = (entry, _range, timestamp) => {
  const source = readIndicatorSeriesEntry<{ series: unknown; params: unknown }>(entry, 'custom')
  return {
    timestamp,
    series: source.series,
    params: source.params,
    valueMin: 0,
    valueMax: 1,
    visibleMin: 0,
    visibleMax: 1,
  }
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
