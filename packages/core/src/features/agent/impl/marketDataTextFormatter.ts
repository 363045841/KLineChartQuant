// 本文件将市场查询的领域结果转义为紧凑 Markdown 表格，降低 Agent 上下文 token 消耗。

import type { InstrumentDescriptor } from '@/data/provider/types.js'
import type { KLineData, TimeShareData } from '@/foundation/types/price.js'
import { formatDateTimeInTimeZone } from '@/foundation/utils/dateFormat.js'
import type {
  BarsQueryResult,
  ChartBarsTextFormatInput,
  InstrumentLookupTextFormatInput,
  MarketDataTextFormatter,
  TimeShareQueryResult,
  TimeShareRangeQueryResult,
} from '../types.js'
import { createMarkdownTable, escapeMarkdownCell } from './markdownTable.js'

/** 构造只含品种、来源和时区的紧凑行情标题。 */
function createTitle(
  kind: string,
  result: { readonly sourceId: string; readonly symbol: string },
  timeZone: string | null,
  details: ReadonlyArray<readonly [string, unknown]> = [],
): string {
  const metadata: Array<readonly [string, unknown]> = [
    ['symbol', result.symbol],
    ['source', result.sourceId],
    ['timezone', timeZone],
    ...details,
  ]
  return `${kind} | ${metadata.map(([key, value]) => `${key}=${escapeMarkdownCell(value)}`).join(' | ')}`
}

/** 按行情时区格式化数据点时间。 */
function formatTime(timestamp: number, timeZone: string | null): string {
  return formatDateTimeInTimeZone(timestamp, timeZone ?? 'UTC')
}

/** 将 K 线数据映射为 OHLCV 表格行。 */
function createBarRows(
  data: ReadonlyArray<KLineData>,
  timeZone: string | null,
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

/** 将品种的全部字段展开为点号路径列，嵌套对象递归、数组以 JSON 保留完整内容。 */
function flattenInstrumentFields(instrument: InstrumentDescriptor): Record<string, string> {
  const fields: Record<string, string> = {}
  const walk = (value: unknown, key: string): void => {
    if (value === null || value === undefined) {
      fields[key] = '-'
      return
    }
    if (Array.isArray(value)) {
      fields[key] = JSON.stringify(value)
      return
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value)
      if (entries.length === 0) {
        fields[key] = '{}'
        return
      }
      for (const [childKey, childValue] of entries) {
        walk(childValue, key ? `${key}.${childKey}` : childKey)
      }
      return
    }
    fields[key] = String(value)
  }
  for (const [key, value] of Object.entries(instrument)) walk(value, key)
  return fields
}

/** 按各行首次出现的顺序收集动态列名。 */
function collectColumnNames(rows: ReadonlyArray<Record<string, string>>): ReadonlyArray<string> {
  const columns: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (seen.has(key)) continue
      seen.add(key)
      columns.push(key)
    }
  }
  return columns
}

/** 将工具查询结果和当前图表快照统一渲染为相同的 K 线文本格式。 */
function formatBarsText(input: ChartBarsTextFormatInput): string {
  return [
    createTitle('market bars', input, input.timezone, [
      ['period', input.period],
      ['adjustment', input.adjustment],
      ['olderData', input.olderData],
    ]),
    createMarkdownTable(
      ['time', 'open', 'high', 'low', 'close', 'volume'],
      createBarRows(input.data, input.timezone),
    ),
  ].join('\n\n')
}

/** 创建市场查询结果 formatter。 */
export function createMarketDataTextFormatter(): MarketDataTextFormatter {
  return {
    /** 将 K 线结果转为紧凑 OHLCV 表格。 */
    formatBars(result: BarsQueryResult): string {
      const { series } = result
      return formatBarsText({
        sourceId: result.sourceId,
        symbol: result.instrument.symbol,
        period: series.period,
        adjustment: series.adjustment,
        timezone: series.timezone,
        data: series.data,
        olderData: result.olderData,
      })
    },
    /** 将当前图表中已加载的 K 线转为与查询工具一致的文本格式。 */
    formatChartBars(input: ChartBarsTextFormatInput): string {
      return formatBarsText(input)
    },
    /** 将精确品种查询的全部匹配转为动态列的 Markdown 表格。 */
    formatInstrumentLookup(input: InstrumentLookupTextFormatInput): string {
      const rows = input.instruments.map(flattenInstrumentFields)
      const columns = collectColumnNames(rows)
      const title = `instrument lookup | symbol=${escapeMarkdownCell(input.symbol)} | matches=${input.instruments.length}`
      const table = createMarkdownTable(
        columns,
        rows.map((row) => columns.map((column) => row[column])),
      )
      return [title, table].join('\n\n')
    },
    /** 将单日分时结果转为紧凑价格表格。 */
    formatTimeShare(result: TimeShareQueryResult): string {
      const { series } = result
      return [
        createTitle(
          'market time share',
          { sourceId: result.sourceId, symbol: result.instrument.symbol },
          series.timezone,
          [
            ['tradingDate', series.tradingDate],
            ['preClose', series.preClose],
          ],
        ),
        createTimeShareTable(series.data, series.timezone),
      ].join('\n\n')
    },
    /** 将多日分时结果合并为紧凑价格表格。 */
    formatTimeShareRange(result: TimeShareRangeQueryResult): string {
      const { range } = result
      const data = range.days.flatMap((day) => day.data)
      return [
        createTitle(
          'market time-share range',
          { sourceId: result.sourceId, symbol: result.instrument.symbol },
          range.timezone,
          [
            ['requestedDays', range.requestedDays],
            ['olderData', range.olderData],
          ],
        ),
        createTimeShareTable(data, range.timezone),
      ].join('\n\n')
    },
  }
}
