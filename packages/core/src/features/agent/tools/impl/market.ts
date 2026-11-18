/** 行情与指标查询工具：只读，不读取也不修改当前图表选择。 */
import { Type } from 'typebox'

import { KLINE_ADJUSTMENTS, KLINE_PERIODS } from '../../../../data/provider/types.js'
import type {
  BarsQueryInput,
  ChartAgentMarketCapability,
  ChartAgentMarketQueries,
  ChartAgentMarketSource,
  IndicatorQueryInput,
  InstrumentLookupInput,
  TimeShareQueryInput,
} from '../../types.js'
import type { ChartToolDefinition, ChartToolMetadata } from '../types.js'
import { textResult } from './helpers.js'

const INDICATOR_QUERY_MAX_LIMIT = 2000
/** 单次返回的 K 线根数上限；区间由 from/to 表达，不再按根数翻页。 */
const BARS_QUERY_MAX_LIMIT = 2000
const BARS_QUERY_DEFAULT_LIMIT = 200
const INSTRUMENTS_QUERY_DEFAULT_LIMIT = 10
const TIMESHARE_MAX_DAYS = 30

const TradingDateParameter = Type.String({
  pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  description: 'Trading day in the instrument timezone, for example "2026-11-18".',
})

/** 可用数据源只声明身份与能力，不声明覆盖哪些品种。 */
function describeSources(sources: ReadonlyArray<ChartAgentMarketSource>): string {
  if (sources.length === 0) return 'No source can serve this tool right now.'
  const items = sources.map((source) =>
    source.description ? `${source.id} (${source.description})` : source.id,
  )
  return `Available sources: ${items.join(', ')}.`
}

export const INSTRUMENTS_QUERY_METADATA: ChartToolMetadata = {
  name: 'instruments_query',
  label: 'Query instrument',
  description:
    'Find instruments by an exact symbol or by a name keyword. Exact symbol matches win; otherwise keyword candidates are returned. When several instruments match, choose from the table or ask the user — never invent a symbol.',
  effect: 'read',
}

export const MARKET_BARS_QUERY_METADATA: ChartToolMetadata = {
  name: 'market_bars_query',
  label: 'Query market bars',
  description:
    'Fetch bars for any symbol without changing the chart. Omit every date to get the latest bars. from/to select a window: "YYYY-MM-DD" for daily and above, RFC 3339 with offset for intraday. limit caps the returned bars; truncated=true means the window was not fully covered.',
  effect: 'read',
}

export const MARKET_TIMESHARE_QUERY_METADATA: ChartToolMetadata = {
  name: 'market_timeshare_query',
  label: 'Query market time share',
  description:
    'Fetch intraday time share for any symbol. Omit tradingDate to use the latest trading day with data; days returns that many trading days ending at tradingDate, each with its own preClose. Multi-day requests need a source that supports timeShareRange.',
  effect: 'read',
}

export const INDICATOR_VALUES_QUERY_METADATA: ChartToolMetadata = {
  name: 'indicator_values_query',
  label: 'Query indicator values',
  description:
    'Calculate a registered chart indicator over all active K-line data and return compact text. Use definitionId, optional numeric calculation params, and a bounded result limit.',
  effect: 'read',
}

/** 把当前可用源拼进描述，模型不需要猜有哪些源。 */
function withSources(
  metadata: ChartToolMetadata,
  market: ChartAgentMarketQueries,
  capability: ChartAgentMarketCapability,
): string {
  return `${metadata.description} ${describeSources(market.listSources(capability))}`
}

/** 按代码或名称查询品种；零匹配由查询面抛出可纠正错误。 */
export function createInstrumentsQueryTool(market: ChartAgentMarketQueries): ChartToolDefinition {
  return {
    ...INSTRUMENTS_QUERY_METADATA,
    description: withSources(INSTRUMENTS_QUERY_METADATA, market, 'instrument'),
    parameters: Type.Object(
      {
        query: Type.String({
          minLength: 1,
          description: 'Exact symbol such as "600519", or a name keyword such as "茅台".',
        }),
        sourceIds: Type.Optional(
          Type.Array(Type.String({ minLength: 1 }), {
            description:
              'Restrict the search to these sourceIds. Omit to search every available source.',
          }),
        ),
        limit: Type.Optional(
          Type.Integer({
            minimum: 1,
            maximum: 50,
            description: 'Maximum number of matches to return. Defaults to 10.',
          }),
        ),
      },
      { additionalProperties: false },
    ),
    summarizeInput: (input) => (input as { readonly query: string }).query,
    async execute(input, context) {
      const args = input as {
        readonly query: string
        readonly sourceIds?: ReadonlyArray<string>
        readonly limit?: number
      }
      const result = await market.lookup(
        {
          query: args.query,
          limit: args.limit ?? INSTRUMENTS_QUERY_DEFAULT_LIMIT,
          ...(args.sourceIds === undefined ? {} : { sourceIds: args.sourceIds }),
        },
        context,
      )
      return textResult(result.content, result.summary)
    },
  }
}

/** 拉取任意品种的 K 线；日期窗口由缓存翻页覆盖。 */
export function createMarketBarsQueryTool(market: ChartAgentMarketQueries): ChartToolDefinition {
  return {
    ...MARKET_BARS_QUERY_METADATA,
    description: withSources(MARKET_BARS_QUERY_METADATA, market, 'bars'),
    parameters: Type.Object(
      {
        symbol: Type.String({
          minLength: 1,
          description: 'Exact symbol as returned by instruments_query.',
        }),
        period: Type.Optional(
          Type.Enum(KLINE_PERIODS, { description: 'Bar period. Defaults to "daily".' }),
        ),
        adjustment: Type.Optional(
          Type.Enum(KLINE_ADJUSTMENTS, { description: 'Price adjustment. Defaults to "none".' }),
        ),
        from: Type.Optional(
          Type.String({
            description:
              'Window start, inclusive. "YYYY-MM-DD" for daily and above; RFC 3339 with offset for intraday, for example "2026-11-18T09:30:00+08:00".',
          }),
        ),
        to: Type.Optional(
          Type.String({
            description:
              'Window end, inclusive. Same format as from. Omit to end at the latest bar.',
          }),
        ),
        limit: Type.Optional(
          Type.Integer({
            minimum: 1,
            maximum: BARS_QUERY_MAX_LIMIT,
            description: `Maximum number of bars to return. Defaults to ${BARS_QUERY_DEFAULT_LIMIT}.`,
          }),
        ),
        sourceId: Type.Optional(
          Type.String({
            minLength: 1,
            description:
              'Only pass this when the user named a source or a previous result returned it. Omit to let Core choose.',
          }),
        ),
      },
      { additionalProperties: false },
    ),
    summarizeInput: (input) => {
      const args = input as BarsQueryInput
      return `${args.symbol} ${args.period ?? 'daily'}`
    },
    async execute(input, context) {
      const args = input as Partial<BarsQueryInput> & { readonly symbol: string }
      const result = await market.bars(
        {
          symbol: args.symbol,
          period: args.period ?? 'daily',
          adjustment: args.adjustment ?? 'none',
          limit: args.limit ?? BARS_QUERY_DEFAULT_LIMIT,
          ...(args.from === undefined ? {} : { from: args.from }),
          ...(args.to === undefined ? {} : { to: args.to }),
          ...(args.sourceId === undefined ? {} : { sourceId: args.sourceId }),
        },
        context,
      )
      return textResult(result.content, result.summary)
    },
  }
}

/** 拉取单日或多日分时；缺省日期由查询面解析。 */
export function createMarketTimeShareQueryTool(
  market: ChartAgentMarketQueries,
): ChartToolDefinition {
  return {
    ...MARKET_TIMESHARE_QUERY_METADATA,
    description: withSources(MARKET_TIMESHARE_QUERY_METADATA, market, 'timeShare'),
    parameters: Type.Object(
      {
        symbol: Type.String({
          minLength: 1,
          description: 'Exact symbol as returned by instruments_query.',
        }),
        tradingDate: Type.Optional(TradingDateParameter),
        days: Type.Optional(
          Type.Integer({
            minimum: 1,
            maximum: TIMESHARE_MAX_DAYS,
            description: `Number of trading days ending at tradingDate. Defaults to 1, at most ${TIMESHARE_MAX_DAYS}.`,
          }),
        ),
        sourceId: Type.Optional(
          Type.String({
            minLength: 1,
            description:
              'Only pass this when the user named a source or a previous result returned it. Omit to let Core choose.',
          }),
        ),
      },
      { additionalProperties: false },
    ),
    summarizeInput: (input) => {
      const args = input as TimeShareQueryInput
      const days = args.days ?? 1
      return days > 1 ? `${args.symbol} x${days}` : args.symbol
    },
    async execute(input, context) {
      const args = input as Partial<TimeShareQueryInput> & { readonly symbol: string }
      const result = await market.timeShare(
        {
          symbol: args.symbol,
          days: args.days ?? 1,
          ...(args.tradingDate === undefined ? {} : { tradingDate: args.tradingDate }),
          ...(args.sourceId === undefined ? {} : { sourceId: args.sourceId }),
        },
        context,
      )
      return textResult(result.content, result.summary)
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
