// 本文件将市场查询的领域结果转义为紧凑 Markdown 表格，降低 Agent 上下文 token 消耗。
import { formatTimestamp } from '../../foundation/utils/dateFormat'

import type { KLineData, TimeShareData } from '../../foundation/types/price'
import type { BarsQueryResult, TimeShareQueryResult, TimeShareRangeQueryResult } from './types'

const EMPTY_RESULT_TEXT = '无可用数据'
const TABLE_SEPARATOR = '---'

/** 市场查询文本转义服务。 */
export interface MarketDataTextFormatter {
  formatBars(result: BarsQueryResult): string
  formatTimeShare(result: TimeShareQueryResult): string
  formatTimeShareRange(result: TimeShareRangeQueryResult): string
}

/** 转义表格单元格，缺失或非有限数值统一使用占位符。 */
function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '-'
  return String(value)
    .replaceAll('|', '\\|')
    .replace(/[\r\n]+/g, ' ')
}

/** 生成字段名仅出现一次的紧凑 Markdown 表格。 */
function createMarkdownTable(
  columns: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<unknown>>,
): string {
  if (rows.length === 0) return EMPTY_RESULT_TEXT
  const header = `| ${columns.join(' | ')} |`
  const separator = `| ${columns.map(() => TABLE_SEPARATOR).join(' | ')} |`
  const body = rows.map((row) => `| ${row.map(formatCell).join(' | ')} |`)
  return [header, separator, ...body].join('\n')
}

/** 构造只含品种、来源和时区的紧凑行情标题。 */
function createTitle(
  kind: string,
  result: Pick<BarsQueryResult, 'sourceId' | 'instrument'>,
  timeZone: string,
  details: ReadonlyArray<readonly [string, unknown]> = [],
): string {
  const metadata: Array<readonly [string, unknown]> = [
    ['symbol', result.instrument.symbol],
    ['source', result.sourceId],
    ['timezone', timeZone],
    ...details,
  ]
  return `${kind} | ${metadata.map(([key, value]) => `${key}=${formatCell(value)}`).join(' | ')}`
}

/** 按行情时区格式化数据点时间。 */
function formatTime(timestamp: number, timeZone: string): string {
  return formatTimestamp(timestamp, { timeZone, showTime: true })
}

/** 将 K 线数据映射为 OHLCV 表格行。 */
function createBarRows(
  data: ReadonlyArray<KLineData>,
  timeZone: string,
): ReadonlyArray<ReadonlyArray<unknown>> {
  return data.map((item) => [
    formatTime(item.timestamp, timeZone),
    item.open,
    item.high,
    item.low,
    item.close,
    item.volume,
  ])
}

/** 判断分时序列是否存在成交量或成交额列。 */
function hasTimeShareField(
  data: ReadonlyArray<TimeShareData>,
  field: 'volume' | 'amount',
): boolean {
  return data.some((item) => item[field] !== undefined)
}

/** 将分时数据映射为最小必要字段的表格行。 */
function createTimeShareTable(data: ReadonlyArray<TimeShareData>, timeZone: string): string {
  const hasVolume = hasTimeShareField(data, 'volume')
  const hasAmount = hasTimeShareField(data, 'amount')
  const columns = ['time', 'price', 'average']
  if (hasVolume) columns.push('volume')
  if (hasAmount) columns.push('amount')
  const rows = data.map((item) => {
    const row: unknown[] = [formatTime(item.timestamp, timeZone), item.price, item.average]
    if (hasVolume) row.push(item.volume)
    if (hasAmount) row.push(item.amount)
    return row
  })
  return createMarkdownTable(columns, rows)
}

/** 创建市场查询结果 formatter。 */
export function createMarketDataTextFormatter(): MarketDataTextFormatter {
  return {
    /** 将 K 线结果转为紧凑 OHLCV 表格。 */
    formatBars(result: BarsQueryResult): string {
      const { series } = result
      return [
        createTitle('market bars', result, series.timezone, [
          ['period', series.period],
          ['adjustment', series.adjustment],
          ['olderData', result.olderData],
        ]),
        createMarkdownTable(
          ['time', 'open', 'high', 'low', 'close', 'volume'],
          createBarRows(series.data, series.timezone),
        ),
      ].join('\n\n')
    },
    /** 将单日分时结果转为紧凑价格表格。 */
    formatTimeShare(result: TimeShareQueryResult): string {
      const { series } = result
      return [
        createTitle('market time share', result, series.timezone, [
          ['tradingDate', series.tradingDate],
          ['preClose', series.preClose],
        ]),
        createTimeShareTable(series.data, series.timezone),
      ].join('\n\n')
    },
    /** 将多日分时结果合并为紧凑价格表格。 */
    formatTimeShareRange(result: TimeShareRangeQueryResult): string {
      const { range } = result
      const data = range.days.flatMap((day) => day.data)
      return [
        createTitle('market time-share range', result, range.timezone, [
          ['requestedDays', range.requestedDays],
          ['olderData', range.olderData],
        ]),
        createTimeShareTable(data, range.timezone),
      ].join('\n\n')
    },
  }
}
