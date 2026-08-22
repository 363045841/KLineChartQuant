// 本文件为已知指标结果提供比通用表格更紧凑的语义化文本转义器。

import { formatTimestamp } from '../../../foundation/utils/dateFormat'
import type { IndicatorResultFormatter, IndicatorTextFormatContext } from './indicatorTextFormatter'

const INDICATOR_DEFINITION_ID = {
  STRUCTURE: 'structure',
  ZONES: 'zones',
  VOLUME_PROFILE: 'volumeProfile',
} as const


// 计算结果为空或结构不符合预期时的统一输出。
const EMPTY_RESULT_TEXT = '无可用数据'
// 结构趋势和事件方向为 up 时的展示文案。
const UP_DIRECTION = '向上'
// 结构趋势和事件方向为 down 时的展示文案。
const DOWN_DIRECTION = '向下'
// 未识别趋势方向时的保守展示文案。
const RANGE_TREND = '震荡'
// 尚未结束的价格区间状态。
const ACTIVE_ZONE = '有效'
// 已记录结束位置的价格区间状态。
const TOUCHED_ZONE = '已触及'

/** 内置指标专用转义器注册表。 */
export const BUILTIN_INDICATOR_FORMATTERS: ReadonlyMap<string, IndicatorResultFormatter> = new Map([
  [INDICATOR_DEFINITION_ID.STRUCTURE, formatStructure],
  [INDICATOR_DEFINITION_ID.ZONES, formatZones],
  [INDICATOR_DEFINITION_ID.VOLUME_PROFILE, formatVolumeProfile],
])

/** 判断未知值是否为普通对象。 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** 读取有限数值字段。 */
function readNumber(value: Readonly<Record<string, unknown>>, key: string): number | null {
  const field = value[key]
  return typeof field === 'number' && Number.isFinite(field) ? field : null
}

/** 读取字符串字段。 */
function readString(value: Readonly<Record<string, unknown>>, key: string): string | null {
  const field = value[key]
  return typeof field === 'string' ? field : null
}

/** 将内部下标转换为对应的行情时间戳。 */
function resolveTimestamp(timestamps: ReadonlyArray<number>, index: number | null): string {
  return index !== null && timestamps[index] !== undefined
    ? ` @ ${formatTimestamp(timestamps[index]!, { showTime: true })}`
    : ''
}

/** 根据查询范围和数量限制保留最近的结构化结果。 */
function selectRecentItems(
  values: ReadonlyArray<unknown>,
  context: IndicatorTextFormatContext,
  indexKey: string,
): ReadonlyArray<Readonly<Record<string, unknown>>> {
  const selected = values.filter(isRecord).filter((value) => {
    const index = readNumber(value, indexKey)
    if (index === null) return true
    const timestamp = context.timestamps[index]
    return timestamp === undefined || (timestamp >= context.from && timestamp <= context.to)
  })
  return selected.length > context.limit ? selected.slice(-context.limit) : selected
}

/** 转义市场结构结果。 */
function formatStructure(context: IndicatorTextFormatContext): string {
  if (!isRecord(context.series)) return EMPTY_RESULT_TEXT
  const trend = readString(context.series, 'trend')
  const trendText = trend === 'up' ? UP_DIRECTION : trend === 'down' ? DOWN_DIRECTION : RANGE_TREND
  const events = Array.isArray(context.series.events)
    ? selectRecentItems(context.series.events, context, 'index')
    : []
  const eventText = events.map((event) => {
    const kind = readString(event, 'kind') ?? '-'
    const direction = readString(event, 'direction') === 'up' ? UP_DIRECTION : DOWN_DIRECTION
    const price = readNumber(event, 'triggerPrice')
    const index = readNumber(event, 'index')
    return `${kind} ${direction} ${price ?? '-'}${resolveTimestamp(context.timestamps, index)}`
  })
  return [
    `Structure`,
    `趋势：${trendText}`,
    ...(eventText.length ? eventText : [EMPTY_RESULT_TEXT]),
  ].join('\n')
}

/** 转义价格区间结果。 */
function formatZones(context: IndicatorTextFormatContext): string {
  if (!Array.isArray(context.series)) return EMPTY_RESULT_TEXT
  const zones = selectRecentItems(context.series, context, 'startIndex')
  if (zones.length === 0) return `Zones\n${EMPTY_RESULT_TEXT}`
  const lines = zones.map((zone) => {
    const kind = readString(zone, 'kind') ?? '-'
    const low = readNumber(zone, 'low')
    const high = readNumber(zone, 'high')
    const startIndex = readNumber(zone, 'startIndex')
    const endIndex = readNumber(zone, 'endIndex')
    const status = endIndex === null ? ACTIVE_ZONE : TOUCHED_ZONE
    return `${kind} ${low ?? '-'}-${high ?? '-'} ${status}${resolveTimestamp(context.timestamps, startIndex)}`
  })
  return ['Zones', ...lines].join('\n')
}

/** 转义成交量分布结果。 */
function formatVolumeProfile(context: IndicatorTextFormatContext): string {
  if (!isRecord(context.series)) return EMPTY_RESULT_TEXT
  const poc = readNumber(context.series, 'poc')
  const valueAreaHigh = readNumber(context.series, 'vah')
  const valueAreaLow = readNumber(context.series, 'val')
  const totalVolume = readNumber(context.series, 'totalVolume')
  const bins = Array.isArray(context.series.bins) ? context.series.bins.filter(isRecord) : []
  const highVolumeBins = [...bins]
    .sort((left, right) => (readNumber(right, 'volume') ?? 0) - (readNumber(left, 'volume') ?? 0))
    .slice(0, Math.min(3, context.limit))
    .map((bin) => `${readNumber(bin, 'priceLow') ?? '-'}-${readNumber(bin, 'priceHigh') ?? '-'}`)
  const lines = [
    'Volume Profile',
    `POC：${poc ?? '-'}`,
    `价值区：${valueAreaLow ?? '-'}-${valueAreaHigh ?? '-'}`,
    `总量：${totalVolume ?? '-'}`,
  ]
  if (highVolumeBins.length > 0) lines.push(`高量区：${highVolumeBins.join(', ')}`)
  return lines.join('\n')
}
