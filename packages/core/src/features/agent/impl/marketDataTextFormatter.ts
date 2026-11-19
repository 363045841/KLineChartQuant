// 本文件把行情查询结果转成 Agent 可读文本：标题回显解析结果，表格只留必要列。
import type { InstrumentDescriptor } from '@/data/provider/types.js'
import {
  formatDateInTimeZone,
  formatDateTimeInTimeZone,
  formatRfc3339InTimeZone,
} from '@/foundation/time/index.js'
import { isIntradayPeriod } from '@/foundation/types/chartPeriod.js'
import type { KLineData, TimeShareData } from '@/foundation/types/price.js'
import type {
  BarsQueryResult,
  ChartBarsTextFormatInput,
  InstrumentLookupTextFormatInput,
  MarketDataTextFormatter,
  TimeShareDaysResult,
} from '../types.js'
import { createMarkdownTable, escapeMarkdownCell } from './markdownTable.js'

/** 品种匹配表的固定列；不再展开数据源的嵌套字段。 */
const INSTRUMENT_COLUMNS = ['source', 'symbol', 'name', 'exchange', 'instrumentType'] as const

/** 构造只含品种、来源与时区等元数据的紧凑标题。 */
function createTitle(
  kind: string,
  metadata: ReadonlyArray<readonly [string, unknown]>,
): string {
  return `${kind} | ${metadata.map(([key, value]) => `${key}=${escapeMarkdownCell(value)}`).join(' | ')}`
}

/** 单根 K 线的时间列：日内周期写 RFC 3339，日线及以上只写日期。 */
function formatBarTime(timestamp: number, timezone: string, period: string): string {
  return isIntradayPeriod(period)
    ? formatRfc3339InTimeZone(timestamp, timezone)
    : formatDateInTimeZone(timestamp, timezone)
}

/** 将 K 线数据映射为 OHLCV 表格行。 */
function createBarRows(
  data: ReadonlyArray<KLineData>,
  timezone: string,
  period: string,
): ReadonlyArray<ReadonlyArray<unknown>> {
  return data.map((item) => [
    formatBarTime(item.timestamp, timezone, period),
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

/**
 * 将单个交易日的分时点映射为表格。
 *
 * 日期由分组标题给出，行内只留 `HH:mm`，避免每行重复日期与时区。
 */
function createTimeShareTable(data: ReadonlyArray<TimeShareData>, timeZone: string): string {
  const hasVolume = hasTimeShareField(data, 'volume')
  const hasAmount = hasTimeShareField(data, 'amount')
  const columns = ['time', 'price', 'average']
  if (hasVolume) columns.push('volume')
  if (hasAmount) columns.push('amount')
  const rows = data.map((item) => {
    const row: unknown[] = [
      formatDateTimeInTimeZone(item.timestamp, timeZone).slice(11),
      item.price,
      item.average,
    ]
    if (hasVolume) row.push(item.volume)
    if (hasAmount) row.push(item.amount)
    return row
  })
  return createMarkdownTable(columns, rows)
}

/** 将单个品种投影为固定列的一行，未知字段留占位符。 */
function instrumentRow(instrument: InstrumentDescriptor): ReadonlyArray<unknown> {
  return [
    instrument.source,
    instrument.symbol,
    instrument.name,
    instrument.exchange,
    instrument.instrumentType,
  ]
}

/** 将 K 线结果转成带返回量摘要的文本。 */
function formatBarsText(
  metadata: ReadonlyArray<readonly [string, unknown]>,
  data: ReadonlyArray<KLineData>,
  timezone: string,
  period: string,
): string {
  return [
    createTitle('market bars', metadata),
    createMarkdownTable(
      ['time', 'open', 'high', 'low', 'close', 'volume'],
      createBarRows(data, timezone, period),
    ),
  ].join('\n\n')
}

/** 创建市场查询结果 formatter。 */
export function createMarketDataTextFormatter(): MarketDataTextFormatter {
  return {
    /** 品种查询：固定列 + 精确/关键字计数，零匹配由调用方转成错误。 */
    formatInstrumentLookup(input: InstrumentLookupTextFormatInput): string {
      const exact = input.matches.filter((match) => match.exact).length
      const fuzzy = input.matches.length - exact
      const title = createTitle('instrument matches', [
        ['query', input.query],
        ['exact', exact],
        ['fuzzy', fuzzy],
      ])
      return [
        title,
        createMarkdownTable(
          INSTRUMENT_COLUMNS,
          input.matches.map((match) => instrumentRow(match.instrument)),
        ),
      ].join('\n\n')
    },

    /** K 线查询：标题回显解析结果与返回量，截断时明确标记。 */
    formatBars(result: BarsQueryResult): string {
      const { series } = result
      const timezone = series.timezone ?? 'UTC'
      return formatBarsText(
        [
          ['symbol', result.instrument.symbol],
          ['source', result.source],
          ['timezone', timezone],
          ['period', series.period],
          ['adjustment', series.adjustment],
          ['returned', series.data.length],
          ['requested', result.requested],
          ['truncated', result.truncated],
          ['olderData', series.olderData],
        ],
        series.data,
        timezone,
        series.period,
      )
    },

    /** 当前图表中已加载的 K 线：与查询工具共用同一张表。 */
    formatChartBars(input: ChartBarsTextFormatInput): string {
      const timezone = input.timezone ?? 'UTC'
      return formatBarsText(
        [
          ['symbol', input.symbol],
          ['source', input.source],
          ['timezone', timezone],
          ['period', input.period],
          ['adjustment', input.adjustment],
          ['returned', input.data.length],
          ['olderData', input.olderData],
        ],
        input.data,
        timezone,
        input.period,
      )
    },

    /** 分时结果：按交易日分段，每天带自己的昨收基准。 */
    formatTimeShareDays(result: TimeShareDaysResult): string {
      const requested =
        result.requestedDate === null || result.requestedDate === result.resolvedDate
          ? result.resolvedDate
          : `${result.resolvedDate} (requested ${result.requestedDate}, resolved)`
      const header = createTitle('market time share', [
        ['symbol', result.instrument.symbol],
        ['source', result.source],
        ['timezone', result.timezone],
        ['tradingDate', requested],
        ['days', result.days.length],
      ])
      const sections = result.days.map((day) =>
        [
          `## ${day.tradingDate} | preClose=${escapeMarkdownCell(day.preClose)}`,
          createTimeShareTable(day.data, result.timezone),
        ].join('\n\n'),
      )
      return [header, ...sections].join('\n\n')
    },
  }
}
