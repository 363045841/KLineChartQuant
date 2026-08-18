/**
 * 语义配置到组件原生 props 的纯映射。
 * 此模块不持有 ChartController，也不写入 StateKernel。
 */

import type { ChartIndicatorConfig, SymbolSpec } from '../../controllers/types'
import type { CustomMarkerEntity } from '../../engine/marker/registry'

import type { SemanticChartConfig } from './types'

/** 可直接绑定给 KLineChart 的语义映射结果。 */
export interface SemanticChartProps {
  symbols: ReadonlyArray<SymbolSpec>
  indicators: ReadonlyArray<ChartIndicatorConfig>
  customMarkers: ReadonlyArray<CustomMarkerEntity>
}

/**
 * 将日期字符串转换为 marker registry 使用的 Unix 毫秒时间戳。
 * @param date 语义配置中的日期字符串
 * @returns Unix 毫秒时间戳
 */
function parseMarkerTimestamp(date: string): number {
  const [datePart, timePart] = date.split(' ')
  const [year, month, day] = datePart!.split('-').map(Number)
  const [hour, minute] = timePart?.split(':').map(Number) ?? [0, 0]
  // 语义日期以 Asia/Shanghai 表示，转换后与历史 marker registry 定位保持一致。
  return Date.UTC(year!, month! - 1, day!, hour! - 8, minute!)
}

/**
 * 将语义配置转换为组件原生 props。
 * @param config 语义配置快照
 * @returns 不带运行时副作用的组件 props
 */
export function toKLineChartProps(config: SemanticChartConfig): SemanticChartProps {
  const { data } = config
  const indicators: ChartIndicatorConfig[] = []

  for (const indicator of config.indicators?.main ?? []) {
    indicators.push({
      definitionId: indicator.type,
      role: 'main',
      enabled: indicator.enabled,
      params: indicator.params as Record<string, unknown> | undefined,
    })
  }
  for (const indicator of config.indicators?.sub ?? []) {
    indicators.push({
      definitionId: indicator.type,
      role: 'sub',
      enabled: indicator.enabled,
      params: indicator.params as Record<string, unknown> | undefined,
    })
  }

  return {
    symbols: [
      {
        symbol: data.symbol,
        market: data.market,
        exchange: data.exchange,
        period: data.period,
        adjust: data.adjust,
        source: data.source,
        startDate: data.startDate,
        endDate: data.endDate,
      },
    ],
    indicators,
    customMarkers: (config.markers?.customMarkers ?? []).map((marker) => ({
      ...marker,
      timestamp: parseMarkerTimestamp(marker.date),
    })),
  }
}
