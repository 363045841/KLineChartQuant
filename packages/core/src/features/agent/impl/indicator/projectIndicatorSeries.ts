/**
 * 指标计算结果投影：把一次计算的 IndicatorSeries 投影为 Agent 可读的列、行与绘图对象。
 *
 * 只做形状投影：不改写计算、不猜结构；不认识的输出直接抛错。
 */

import type { IndicatorSeries, OhlcPlot, Plot } from '@363045841yyt/klinechart-plot-contracts'
import { isOhlcPlot } from '@363045841yyt/klinechart-plot-contracts'
import { isTradingDate } from '@/data/provider/types.js'
import type { IndicatorResult } from '@/engine/indicators/instances/domain/indicatorModel.js'
import { isIndicatorSeries } from '@/engine/plots/impl/readPlotState.js'
import { INDICATOR_SERIES_ERROR_CODES, KLineChartError } from '@/errors.js'
import {
  formatDateInTimeZone,
  formatRfc3339InTimeZone,
  parseRfc3339WithOffset,
} from '@/foundation/time/index.js'
import { isIntradayPeriod } from '@/foundation/types/chartPeriod.js'
import type {
  ChartAgentIndicatorHLine,
  ChartAgentIndicatorSeriesColumn,
  ChartAgentIndicatorSeriesObject,
  ChartAgentIndicatorSeriesResult,
} from '../../types.js'

/** 投影所需的图表作用域与查询边界。 */
export interface IndicatorSeriesProjectionInput {
  readonly result: IndicatorResult
  /** 日线及以上写 YYYY-MM-DD，日内写带偏移的 RFC 3339。 */
  readonly from?: string
  readonly to?: string
  readonly limit: number
  readonly period: string
  readonly timezone: string
}

/** 单个输出通道的列声明与逐 bar 取值。 */
interface Channel {
  readonly column: ChartAgentIndicatorSeriesColumn
  read(index: number): number | null
}

/** 按种类生成通道：OHLC 展开四列，其余一列；标记类附带位置语义。 */
function channelOf(plot: Plot): ReadonlyArray<Channel> {
  if (isOhlcPlot(plot)) {
    const base = { label: plot.label, kind: plot.kind }
    const columns: ReadonlyArray<[string, (point: OhlcPlot['data'][number]) => number]> = [
      ['open', (point) => point!.open],
      ['high', (point) => point!.high],
      ['low', (point) => point!.low],
      ['close', (point) => point!.close],
    ]
    return columns.map(([field, read]) => ({
      column: { ...base, id: `${plot.id}.${field}` },
      read: (index) => {
        const point = plot.data[index - plot.offset]
        return point === undefined ? null : read(point)
      },
    }))
  }
  const column: ChartAgentIndicatorSeriesColumn = {
    id: plot.id,
    label: plot.label,
    kind: plot.kind,
    ...(plot.kind === 'shape' || plot.kind === 'char'
      ? {
          location: plot.location,
          text: plot.text,
          ...(plot.kind === 'char' ? { char: plot.char } : {}),
        }
      : {}),
  }
  return [
    {
      column,
      read: (index) => {
        const point = plot.data[index - plot.offset]
        return point?.value ?? null
      },
    },
  ]
}

/** 读取一个绘图对象的锚点：坐标优先取脚本索引，其次取时间戳。 */
function objectOf(
  drawing: NonNullable<IndicatorSeries['drawings']>[number],
  timestamps: readonly number[],
  formatTime: (timestamp: number) => string,
): ChartAgentIndicatorSeriesObject {
  const anchor = drawing.anchors[0]
  const index =
    anchor?.logicalIndex ??
    (typeof anchor?.time === 'number' ? timestamps.indexOf(anchor.time) : null)
  return {
    kind: drawing.kind,
    index,
    time:
      index !== null && timestamps[index] !== undefined
        ? formatTime(timestamps[index]!)
        : typeof anchor?.time === 'number'
          ? formatTime(anchor.time)
          : typeof anchor?.time === 'string'
            ? anchor.time
            : null,
    price: anchor?.price ?? null,
    text: drawing.text?.value ?? null,
  }
}

/** 把未知输出投影为 Agent 视图；非 IndicatorSeries 一律拒绝。 */
export function projectIndicatorSeries(
  input: IndicatorSeriesProjectionInput,
): ChartAgentIndicatorSeriesResult {
  const series = input.result.series
  if (!isIndicatorSeries(series)) {
    throw new KLineChartError(
      INDICATOR_SERIES_ERROR_CODES.UNREADABLE_SERIES,
      'This indicator produced no readable series. Add plot.* channels to the script so its values become readable, then retry.',
    )
  }
  const intraday = isIntradayPeriod(input.period)
  const timestamps = input.result.timestamps
  const formatTime = (timestamp: number) =>
    intraday
      ? formatRfc3339InTimeZone(timestamp, input.timezone)
      : formatDateInTimeZone(timestamp, input.timezone)
  const times = timestamps.map(formatTime)

  const fromTimestamp = intraday && input.from ? parseRfc3339WithOffset(input.from) : null
  const toTimestamp = intraday && input.to ? parseRfc3339WithOffset(input.to) : null
  if (input.from !== undefined && intraday && fromTimestamp === null)
    throw new TypeError('from must be RFC 3339 for intraday periods')
  if (input.to !== undefined && intraday && toTimestamp === null)
    throw new TypeError('to must be RFC 3339 for intraday periods')
  if (input.from !== undefined && !intraday && !isTradingDate(input.from))
    throw new TypeError('from must be a trading date "YYYY-MM-DD" for daily and above')
  if (input.to !== undefined && !intraday && !isTradingDate(input.to))
    throw new TypeError('to must be a trading date "YYYY-MM-DD" for daily and above')

  const inRange = (index: number): boolean => {
    if (intraday) {
      if (fromTimestamp !== null && timestamps[index]! < fromTimestamp) return false
      if (toTimestamp !== null && timestamps[index]! > toTimestamp) return false
      return true
    }
    if (input.from !== undefined && times[index]! < input.from) return false
    if (input.to !== undefined && times[index]! > input.to) return false
    return true
  }

  const channels: Channel[] = []
  for (const plot of series.plots) {
    if (plot.visible === false) continue
    channels.push(...channelOf(plot))
  }

  const indexes = timestamps.map((_, index) => index).filter(inRange)
  const shownIndexes = indexes.slice(-input.limit)
  const rows = shownIndexes.map((index) => [
    index,
    times[index]!,
    ...channels.map((channel) => channel.read(index)),
  ])

  const objects = (series.drawings ?? [])
    .map((drawing) => objectOf(drawing, timestamps, formatTime))
    .filter((object) => object.index === null || inRange(object.index))
    .sort(
      (left, right) =>
        (left.index ?? Number.MAX_SAFE_INTEGER) - (right.index ?? Number.MAX_SAFE_INTEGER),
    )
  const shownObjects = objects.slice(-input.limit)

  const hlines: ChartAgentIndicatorHLine[] = (series.hlines ?? []).map((line) => ({
    id: line.id,
    price: line.price,
    title: line.title ?? null,
  }))

  const truncatedRows = indexes.length - shownIndexes.length
  const truncatedObjects = objects.length - shownObjects.length
  return {
    series: {
      columns: channels.map((channel) => channel.column),
      rows,
    },
    objects: shownObjects,
    hlines,
    ...(truncatedRows > 0 || truncatedObjects > 0
      ? { truncated: { rows: truncatedRows, objects: truncatedObjects } }
      : {}),
  }
}
