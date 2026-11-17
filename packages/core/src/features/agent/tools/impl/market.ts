/** 行情与指标查询工具：只读，不读取也不修改当前图表选择。 */
import { Type } from 'typebox'

import type { TradingDate } from '../../../../data/provider/types.js'
import {
  BAR_AGGREGATIONS,
  KLINE_ADJUSTMENTS,
  KLINE_PERIODS,
  KNOWN_INSTRUMENT_TYPES,
} from '../../../../data/provider/types.js'
import type { ChartAgentMarketQueries, IndicatorQueryInput } from '../../types.js'
import type { ChartToolDefinition, ChartToolMetadata } from '../types.js'
import { textResult } from './helpers.js'

const INDICATOR_QUERY_MAX_LIMIT = 2000
/** GoTDX V1 /bars 接口单页最大返回条数。 */
const MARKET_BARS_QUERY_MAX_LIMIT = 798

const KLinePeriod = Type.Enum(KLINE_PERIODS)
const KLineAdjustment = Type.Enum(KLINE_ADJUSTMENTS)
const BarAggregation = Type.Enum(BAR_AGGREGATIONS)
const InstrumentType = Type.Enum(KNOWN_INSTRUMENT_TYPES)
const TradingDateParameter = Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })

interface InstrumentsQueryInput {
  readonly symbol: string
  readonly sourceIds?: ReadonlyArray<string>
}

interface BarsQueryInput {
  readonly symbol: string
  readonly period: (typeof KLINE_PERIODS)[number]
  readonly adjustment: (typeof KLINE_ADJUSTMENTS)[number]
  readonly barAggregation: (typeof BAR_AGGREGATIONS)[number]
  readonly limit: number
  readonly sourceId?: string
  readonly exchange?: string
  readonly instrumentType?: (typeof KNOWN_INSTRUMENT_TYPES)[number]
}

interface TimeShareQueryInput {
  readonly symbol: string
  readonly tradingDate: string
  readonly days?: number
  readonly sourceId?: string
  readonly exchange?: string
  readonly instrumentType?: (typeof KNOWN_INSTRUMENT_TYPES)[number]
}

/** 运行时可用数据源说明；每次解析工具时按当前启用集合生成。 */
function sourceHint(sources: ReadonlyArray<string>): string {
  const available = sources.length ? sources.join(', ') : 'none'
  return `Available runtime sourceIds: ${available}. Use only these exact values; omit the field to route across every enabled source.`
}

export const INSTRUMENTS_QUERY_METADATA: ChartToolMetadata = {
  name: 'instruments_query',
  label: 'Query instrument',
  description:
    'Look up security names by an exact symbol through the active market-data sources, optionally restricted by sourceIds. Returns a Markdown table of every exact match with all instrument fields; never infer a name from a partial match. When the table has more than one row, call ask_user with one option per row and wait before continuing.',
  effect: 'read',
}

export const MARKET_BARS_QUERY_METADATA: ChartToolMetadata = {
  name: 'market_bars_query',
  label: 'Query market bars',
  description:
    'Fetch the latest page of market bars for any symbol without changing the chart. limit must be an integer from 1 to 798. Pagination and retries are handled by the cache.',
  effect: 'read',
}

export const MARKET_TIMESHARE_QUERY_METADATA: ChartToolMetadata = {
  name: 'market_timeshare_query',
  label: 'Query market time share',
  description:
    'Fetch intraday time-share data for any symbol without changing the chart. days defaults to 1 and must be at least 1; with days > 1 tradingDate is the last trading day of the returned range.',
  effect: 'read',
}

export const INDICATOR_VALUES_QUERY_METADATA: ChartToolMetadata = {
  name: 'indicator_values_query',
  label: 'Query indicator values',
  description:
    'Calculate a registered chart indicator over all active K-line data and return compact text. Use definitionId, optional numeric calculation params, and a bounded result limit.',
  effect: 'read',
}

/** 按代码精确查询品种；多候选时由模型调用 ask_user 澄清。 */
export function createInstrumentsQueryTool(market: ChartAgentMarketQueries): ChartToolDefinition {
  const sources = market.listSourceIds()
  return {
    ...INSTRUMENTS_QUERY_METADATA,
    description: `${INSTRUMENTS_QUERY_METADATA.description} ${sourceHint(sources)}`,
    parameters: Type.Object(
      {
        symbol: Type.String({ minLength: 1 }),
        sourceIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
      },
      { additionalProperties: false },
    ),
    summarizeInput: (input) => (input as InstrumentsQueryInput).symbol,
    async execute(input, context) {
      const args = input as InstrumentsQueryInput
      return textResult(
        await market.lookupInstrument(
          {
            symbol: args.symbol,
            ...(args.sourceIds === undefined ? {} : { sourceIds: args.sourceIds }),
          },
          context,
        ),
        `Looked up ${args.symbol}.`,
      )
    },
  }
}

/** 拉取任意品种的最新一页 K 线。 */
export function createMarketBarsQueryTool(market: ChartAgentMarketQueries): ChartToolDefinition {
  const sources = market.listSourceIds()
  return {
    ...MARKET_BARS_QUERY_METADATA,
    description: `${MARKET_BARS_QUERY_METADATA.description} ${sourceHint(sources)}`,
    parameters: Type.Object(
      {
        symbol: Type.String({ minLength: 1 }),
        period: KLinePeriod,
        adjustment: KLineAdjustment,
        barAggregation: BarAggregation,
        limit: Type.Integer({ minimum: 1, maximum: MARKET_BARS_QUERY_MAX_LIMIT }),
        sourceId: Type.Optional(Type.String({ minLength: 1 })),
        exchange: Type.Optional(Type.String({ minLength: 1 })),
        instrumentType: Type.Optional(InstrumentType),
      },
      { additionalProperties: false },
    ),
    summarizeInput: (input) => {
      const args = input as BarsQueryInput
      return `${args.symbol} ${args.period} x${args.limit}`
    },
    async execute(input, context) {
      const args = input as BarsQueryInput
      return textResult(
        await market.bars(
          {
            symbol: args.symbol,
            period: args.period,
            adjustment: args.adjustment,
            barAggregation: args.barAggregation,
            limit: args.limit,
            ...(args.sourceId === undefined ? {} : { sourceId: args.sourceId }),
            ...(args.exchange === undefined ? {} : { exchange: args.exchange }),
            ...(args.instrumentType === undefined ? {} : { instrumentType: args.instrumentType }),
          },
          context,
        ),
        `Returned bars for ${args.symbol}.`,
      )
    },
  }
}

/** 拉取单日或多日分时；days 决定走哪条查询链路。 */
export function createMarketTimeShareQueryTool(
  market: ChartAgentMarketQueries,
): ChartToolDefinition {
  const sources = market.listSourceIds()
  return {
    ...MARKET_TIMESHARE_QUERY_METADATA,
    description: `${MARKET_TIMESHARE_QUERY_METADATA.description} ${sourceHint(sources)}`,
    parameters: Type.Object(
      {
        symbol: Type.String({ minLength: 1 }),
        tradingDate: TradingDateParameter,
        days: Type.Optional(Type.Integer({ minimum: 1 })),
        sourceId: Type.Optional(Type.String({ minLength: 1 })),
        exchange: Type.Optional(Type.String({ minLength: 1 })),
        instrumentType: Type.Optional(InstrumentType),
      },
      { additionalProperties: false },
    ),
    summarizeInput: (input) => {
      const args = input as TimeShareQueryInput
      return `${args.symbol} ${args.tradingDate}${args.days && args.days > 1 ? ` x${args.days}` : ''}`
    },
    async execute(input, context) {
      const args = input as TimeShareQueryInput
      return textResult(
        await market.timeShare(
          {
            symbol: args.symbol,
            tradingDate: args.tradingDate as TradingDate,
            days: args.days ?? 1,
            ...(args.sourceId === undefined ? {} : { sourceId: args.sourceId }),
            ...(args.exchange === undefined ? {} : { exchange: args.exchange }),
            ...(args.instrumentType === undefined ? {} : { instrumentType: args.instrumentType }),
          },
          context,
        ),
        `Returned time share for ${args.symbol}.`,
      )
    },
  }
}

/** 计算指标数值序列。 */
export function createIndicatorValuesQueryTool(
  market: ChartAgentMarketQueries,
): ChartToolDefinition {
  return {
    ...INDICATOR_VALUES_QUERY_METADATA,
    parameters: Type.Object(
      {
        definitionId: Type.String({ minLength: 1 }),
        params: Type.Optional(Type.Record(Type.String(), Type.Number())),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: INDICATOR_QUERY_MAX_LIMIT })),
      },
      { additionalProperties: false },
    ),
    summarizeInput: (input) => (input as IndicatorQueryInput).definitionId,
    async execute(input) {
      const args = input as IndicatorQueryInput
      return textResult(
        await market.indicatorValues({
          definitionId: args.definitionId,
          ...(args.params === undefined ? {} : { params: args.params }),
          ...(args.limit === undefined ? {} : { limit: args.limit }),
        }),
        `Computed ${args.definitionId}.`,
      )
    },
  }
}
