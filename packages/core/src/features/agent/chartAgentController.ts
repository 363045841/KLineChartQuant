// 本文件实现 AI-Native 的 Chart Agent 查询 API。
import { Type } from 'typebox'

import { KLineChartError } from '../../errors'
import { lookupInstrumentsBySymbol, searchInstruments } from '../../data/provider/instrumentSearch'
import type { MarketDataProviderRegistry } from '../../data/provider/registry'
import { MarketDataCache } from '../../data/buffer/marketDataCache'
import { computed, type ReadonlySignal } from '../../foundation/reactivity/signal'

import { Tool, getRegisteredChartTools, type ChartToolExecutionContext } from './chartToolRegistry'
import { CHART_AGENT_ERROR_CODES } from './errors'

import type { IndicatorQuery } from './indicator/indicatorQuery'
import type {
  ChartAgentActiveIndicator,
  ChartAgentContextSnapshot,
  ChartAgentController,
  ChartAgentTimeRange,
  BarsQueryInput,
  BarsQueryResult,
  IndicatorQueryInput,
  TimeShareQueryInput,
  TimeShareQueryResult,
  TimeShareRangeQueryInput,
  TimeShareRangeQueryResult,
} from './types'
import type { IndicatorInstance, SymbolSpec } from '../../controllers/types'
import type { AssetClass, KLineAdjustment, KLinePeriod, TradingDate } from '../../data/provider/types'
import type { DataStateModule } from '../../engine/state/dataState'

interface ChartAgentControllerDependencies {
  readonly chartId: string
  readonly dataState: DataStateModule
  readonly currentSpec: ReadonlySignal<SymbolSpec | null>
  readonly chartMode: ReadonlySignal<'kline' | 'timeshare' | 'fiveDayTimeShare' | 'comparison'>
  readonly selectedRange: ReadonlySignal<ChartAgentTimeRange | null>
  readonly indicators: ReadonlySignal<ReadonlyArray<IndicatorInstance>>
  readonly indicatorQuery: IndicatorQuery
  readonly marketDataProviderRegistry: MarketDataProviderRegistry
  readonly marketDataCache: MarketDataCache
}

const InstrumentLookupToolParameters = Type.Object({
  symbol: Type.String({ minLength: 1 }),
  sourceIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
})

const INDICATOR_QUERY_MAX_LIMIT = 2000
const KLINE_PERIOD_VALUES = [
  '1min',
  '5min',
  '15min',
  '30min',
  '60min',
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
] as const satisfies ReadonlyArray<KLinePeriod>
const KLINE_ADJUSTMENT_VALUES = ['qfq', 'hfq', 'splits', 'none'] as const satisfies ReadonlyArray<KLineAdjustment>
const ASSET_CLASS_VALUES = [
  'stock',
  'index',
  'fund',
  'etf',
  'future',
  'option',
  'forex',
  'crypto',
  'unknown',
] as const satisfies ReadonlyArray<AssetClass>

const KLinePeriodToolParameter = Type.Union(KLINE_PERIOD_VALUES.map((value) => Type.Literal(value)))
const KLineAdjustmentToolParameter = Type.Union(
  KLINE_ADJUSTMENT_VALUES.map((value) => Type.Literal(value)),
)
const AssetClassToolParameter = Type.Union(ASSET_CLASS_VALUES.map((value) => Type.Literal(value)))
const TradingDateToolParameter = Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })

const IndicatorQueryToolParameters = Type.Object({
  definitionId: Type.String({ minLength: 1 }),
  params: Type.Optional(Type.Record(Type.String(), Type.Number())),
  from: Type.Optional(Type.Number()),
  to: Type.Optional(Type.Number()),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: INDICATOR_QUERY_MAX_LIMIT })),
})

const BarsQueryToolParameters = Type.Object({
  symbol: Type.String({ minLength: 1 }),
  period: KLinePeriodToolParameter,
  adjustment: KLineAdjustmentToolParameter,
  limit: Type.Integer({ minimum: 1 }),
  sourceId: Type.Optional(Type.String({ minLength: 1 })),
  exchange: Type.Optional(Type.String({ minLength: 1 })),
  assetClass: Type.Optional(AssetClassToolParameter),
  before: Type.Optional(Type.Number()),
})

const TimeShareQueryToolParameters = Type.Object({
  symbol: Type.String({ minLength: 1 }),
  tradingDate: TradingDateToolParameter,
  sourceId: Type.Optional(Type.String({ minLength: 1 })),
  exchange: Type.Optional(Type.String({ minLength: 1 })),
  assetClass: Type.Optional(AssetClassToolParameter),
})

const TimeShareRangeQueryToolParameters = Type.Object({
  symbol: Type.String({ minLength: 1 }),
  endTradingDate: TradingDateToolParameter,
  days: Type.Integer({ minimum: 1 }),
  sourceId: Type.Optional(Type.String({ minLength: 1 })),
  exchange: Type.Optional(Type.String({ minLength: 1 })),
  assetClass: Type.Optional(AssetClassToolParameter),
})

/** 将图表指标实例投影为可安全暴露给 Agent 的只读快照。 */
function projectIndicators(
  indicators: ReadonlyArray<IndicatorInstance>,
): ReadonlyArray<ChartAgentActiveIndicator> {
  return Object.freeze(
    indicators.map((indicator) => {
      const params: Record<string, number> = {}
      for (const [name, value] of Object.entries(indicator.params)) {
        if (typeof value === 'number' && Number.isFinite(value)) params[name] = value
      }
      return Object.freeze({
        instanceId: indicator.id,
        definitionId: indicator.definitionId,
        params: Object.freeze(params),
      })
    }),
  )
}

/** 从当前数据计算含首尾时间戳的完整数据范围。 */
function requireTimestampRange(data: ReadonlyArray<{ readonly timestamp: number }>): {
  readonly from: number
  readonly to: number
} {
  let from = Number.POSITIVE_INFINITY
  let to = Number.NEGATIVE_INFINITY
  for (const item of data) {
    if (!Number.isFinite(item.timestamp)) continue
    from = Math.min(from, item.timestamp)
    to = Math.max(to, item.timestamp)
  }
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    throw new KLineChartError(
      CHART_AGENT_ERROR_CODES.NO_DATA,
      'Chart Agent context requires active timestamped market data',
    )
  }
  return { from, to }
}

/** 实现 UI 和 Agent 共用的图表查询 API。 */
class ChartAgentControllerImpl implements ChartAgentController {
  /** 图表状态的响应式只读上下文投影。 */
  readonly context: ReadonlySignal<ChartAgentContextSnapshot | null>
  /** 创建图表 Agent facade，并使用图表共享的行情缓存。 */
  constructor(private readonly dependencies: ChartAgentControllerDependencies) {
    this.context = computed(() => this.createContext())
  }

  /** 从 StateKernel 派生当前图表的只读上下文。 */
  private createContext(): ChartAgentContextSnapshot | null {
    const activeBuffer = this.dependencies.dataState.readonly.activeBuffer()
    if (activeBuffer.kind === 'empty' || activeBuffer.data.length === 0) return null

    const spec = this.dependencies.currentSpec()
    const dataRange = requireTimestampRange(activeBuffer.data)
    const selection = activeBuffer.selection
    const symbol = spec?.instrument?.symbol ?? spec?.symbol ?? null
    const market = spec?.market ?? null
    const exchange = spec?.instrument?.exchange ?? spec?.exchange ?? null
    const dataSource = selection.sourceId || spec?.source || spec?.instrument?.sourceId || null
    const period = this.dependencies.chartMode()
    const adjustMode = selection.kind === 'bars' ? selection.adjustment : (spec?.adjust ?? null)
    const timezone =
      activeBuffer.kind === 'timeShare' ? (activeBuffer.timeShareRange?.timezone ?? null) : null

    return Object.freeze({
      chartId: this.dependencies.chartId,
      symbol,
      market,
      exchange,
      period,
      dataSource,
      timezone,
      adjustMode,
      dataRange: Object.freeze({ ...dataRange, bars: activeBuffer.data.length }),
      visibleRange: this.dependencies.selectedRange(),
      activeIndicators: projectIndicators(this.dependencies.indicators()),
      dataRevision: activeBuffer.dataRevision,
    })
  }

  /** 返回当前完整图表上下文；无行情数据时抛出领域错误。 */
  getContext(): ChartAgentContextSnapshot {
    const snapshot = this.createContext()
    if (!snapshot) {
      throw new KLineChartError(
        CHART_AGENT_ERROR_CODES.NO_DATA,
        'Chart Agent context requires active market data',
      )
    }
    return snapshot
  }

  /** 查询当前图表数据上的指标值；前端和 Agent 调用同一领域 API。 */
  @Tool({
    name: 'indicators_query',
    label: 'Query indicator',
    description:
      'Calculate a registered chart indicator over the active K-line data and return compact text. Use definitionId, optional numeric calculation params, an optional inclusive timestamp range, and a bounded result limit.',
    parameters: IndicatorQueryToolParameters,
    safety: 'read-only',
    executionMode: 'parallel',
  })
  queryIndicator(input: IndicatorQueryInput, _context?: ChartToolExecutionContext): Promise<string> {
    return this.dependencies.indicatorQuery.queryIndicator(input)
  }

  /** 执行面向前端联想搜索的模糊品种查询。 */
  searchInstruments(input: Parameters<typeof searchInstruments>[1]) {
    return searchInstruments(this.dependencies.marketDataProviderRegistry, input)
  }

  /** 按证券代码精确查询标准品种；前端和 Agent 调用同一领域 API。 */
  @Tool({
    name: 'instruments_query_name',
    label: 'Query instrument name',
    description:
      'Look up security names by an exact symbol through the active market-data sources. Optionally restrict the lookup to sourceIds. Return every exact match with its source and exchange; never infer a name from a partial match.',
    parameters: InstrumentLookupToolParameters,
    safety: 'read-only',
    executionMode: 'parallel',
  })
  lookupInstrumentsBySymbol(
    input: Parameters<typeof lookupInstrumentsBySymbol>[1],
    context?: ChartToolExecutionContext,
  ) {
    return lookupInstrumentsBySymbol(this.dependencies.marketDataProviderRegistry, {
      ...input,
      signal: context?.signal ?? input.signal,
    })
  }

  /** 查询任意品种的一页 K 线；UI 与 Agent 使用同一无状态 API。 */
  @Tool({
    name: 'market_bars_query',
    label: 'Query market bars',
description:
      'Fetch one page of market bars for any symbol without changing the chart. Use limit for the number of bars and optional before as an exclusive timestamp cursor; pagination and retries are handled by the cache.',
    parameters: BarsQueryToolParameters,
    safety: 'read-only',
    executionMode: 'parallel',
  })
  async queryBars(
    input: BarsQueryInput,
    context?: ChartToolExecutionContext,
  ): Promise<BarsQueryResult> {
    const result = await this.dependencies.marketDataCache.queryBars({
      sourceId: input.sourceId,
      symbol: input.symbol,
      exchange: input.exchange,
      assetClass: input.assetClass,
      period: input.period,
      adjustment: input.adjustment,
      limit: input.limit,
      before: input.before,
      signal: context?.signal,
    })
    return {
      sourceId: result.sourceId,
      instrument: result.instrument,
      series: result.series,
      olderData: result.series.olderData,
    }
  }

  /** 查询任意品种单个交易日的分时；不读取或修改图表运行时状态。 */
  @Tool({
    name: 'market_timeshare_query',
    label: 'Query market time share',
    description:
      'Fetch one trading day of intraday time-share data for any symbol without changing the chart.',
    parameters: TimeShareQueryToolParameters,
    safety: 'read-only',
    executionMode: 'parallel',
  })
  async queryTimeShare(
    input: TimeShareQueryInput,
    context?: ChartToolExecutionContext,
  ): Promise<TimeShareQueryResult> {
    const result = await this.dependencies.marketDataCache.queryTimeShare({
      sourceId: input.sourceId,
      symbol: input.symbol,
      exchange: input.exchange,
      assetClass: input.assetClass,
      tradingDate: input.tradingDate as TradingDate,
      signal: context?.signal,
    })
    return {
      sourceId: result.sourceId,
      instrument: result.instrument,
      series: result.series,
    }
  }

  /** 查询任意品种多个交易日的分时；不读取或修改图表运行时状态。 */
  @Tool({
    name: 'market_timeshare_range_query',
    label: 'Query market time-share range',
    description:
      'Fetch multiple trading days of intraday time-share data for any symbol without changing the chart.',
    parameters: TimeShareRangeQueryToolParameters,
    safety: 'read-only',
    executionMode: 'parallel',
  })
  async queryTimeShareRange(
    input: TimeShareRangeQueryInput,
    context?: ChartToolExecutionContext,
  ): Promise<TimeShareRangeQueryResult> {
    const result = await this.dependencies.marketDataCache.queryTimeShareRange({
      sourceId: input.sourceId,
      symbol: input.symbol,
      exchange: input.exchange,
      assetClass: input.assetClass,
      endTradingDate: input.endTradingDate as TradingDate,
      days: input.days,
      signal: context?.signal,
    })
    return {
      sourceId: result.sourceId,
      instrument: result.instrument,
      range: result.range,
    }
  }
}

/** 创建稳定的 Chart Agent facade。 */
export function createChartAgentController(
  dependencies: ChartAgentControllerDependencies,
): ChartAgentController {
  return new ChartAgentControllerImpl(dependencies)
}

/** 返回已标注的 Chart Agent API，导入本模块时确保装饰器完成注册。 */
export { getRegisteredChartTools }
