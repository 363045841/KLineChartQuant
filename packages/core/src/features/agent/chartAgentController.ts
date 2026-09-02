// 本文件实现 AI-Native 的 Chart Agent 查询 API。
import { type Static, Type } from 'typebox'

import { KLineChartError } from '../../errors'
import { lookupInstrumentsBySymbol, searchInstruments } from '../../data/provider/instrumentSearch'
import type { MarketDataProviderRegistry } from '../../data/provider/registry'
import { MarketDataCache } from '../../data/buffer/marketDataCache'
import { computed, type ReadonlySignal } from '../../foundation/reactivity/signal'
import type { DrawingDocument } from '../../engine/drawing/DrawingDocument'
import type { DrawingObject } from '../../foundation/plugin'

import { Tool, getRegisteredChartTools, type ChartToolExecutionContext } from './chartToolRegistry'
import { CHART_AGENT_ERROR_CODES } from './errors'
import {
  createMarketDataTextFormatter,
  type MarketDataTextFormatter,
} from './marketDataTextFormatter'

import type { IndicatorQuery } from './indicator/indicatorQuery'
import type {
  ChartAgentActiveIndicator,
  ChartAgentContextSnapshot,
  ChartAgentController,
  ChartAgentDrawingSnapshot,
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
import type {
  AssetClass,
  KLineAdjustment,
  KLinePeriod,
  TradingDate,
} from '../../data/provider/types'
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
  readonly drawingDocument: DrawingDocument
  readonly marketDataTextFormatter?: MarketDataTextFormatter
}

const InstrumentLookupToolParameters = Type.Object({
  symbol: Type.String({ minLength: 1 }),
  sourceIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
})

const INDICATOR_QUERY_MAX_LIMIT = 2000
/** GoTDX V1 /bars 接口单页最大返回条数。 */
const MARKET_BARS_QUERY_MAX_LIMIT = 798
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
const KLINE_ADJUSTMENT_VALUES = [
  'qfq',
  'hfq',
  'splits',
  'none',
] as const satisfies ReadonlyArray<KLineAdjustment>
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
  limit: Type.Integer({ minimum: 1, maximum: MARKET_BARS_QUERY_MAX_LIMIT }),
  sourceId: Type.Optional(Type.String({ minLength: 1 })),
  exchange: Type.Optional(Type.String({ minLength: 1 })),
  assetClass: Type.Optional(AssetClassToolParameter),
  before: Type.Optional(TradingDateToolParameter),
})

type BarsQueryToolInput = Static<typeof BarsQueryToolParameters>

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

const DRAWING_KIND_VALUES = [
  'trend-line',
  'ray',
  'extended-line',
  'fib-retracement',
  'rectangle',
  'arrow',
  'horizontal-line',
  'horizontal-ray',
  'vertical-line',
  'cross-line',
  'info-line',
  'parallel-channel',
  'regression-channel',
  'flat-line',
  'disjoint-channel',
] as const

const DrawingKindToolParameter = Type.Union(DRAWING_KIND_VALUES.map((value) => Type.Literal(value)))
const DrawingAnchorToolParameters = Type.Object({
  time: Type.Number(),
  price: Type.Number(),
})
const DrawingStyleToolParameters = Type.Partial(
  Type.Object({
    stroke: Type.String({ minLength: 1 }),
    strokeWidth: Type.Number({ exclusiveMinimum: 0 }),
    strokeStyle: Type.Union([
      Type.Literal('solid'),
      Type.Literal('dashed'),
      Type.Literal('dotted'),
    ]),
    fill: Type.String({ minLength: 1 }),
    fillOpacity: Type.Number({ minimum: 0, maximum: 1 }),
    pointRadius: Type.Number({ exclusiveMinimum: 0 }),
    textColor: Type.String({ minLength: 1 }),
    fontSize: Type.Number({ exclusiveMinimum: 0 }),
  }),
)
const DrawingCreateToolParameters = Type.Object({
  kind: DrawingKindToolParameter,
  paneId: Type.String({ minLength: 1 }),
  anchors: Type.Array(DrawingAnchorToolParameters, { minItems: 1, maxItems: 3 }),
  style: Type.Optional(DrawingStyleToolParameters),
  visible: Type.Optional(Type.Boolean()),
  locked: Type.Optional(Type.Boolean()),
  zIndex: Type.Optional(Type.Number()),
})
const DrawingUpdatePatchToolParameters = Type.Object(
  {
    anchors: Type.Optional(Type.Array(DrawingAnchorToolParameters, { minItems: 1, maxItems: 3 })),
    style: Type.Optional(DrawingStyleToolParameters),
    visible: Type.Optional(Type.Boolean()),
    locked: Type.Optional(Type.Boolean()),
    zIndex: Type.Optional(Type.Number()),
  },
  { minProperties: 1 },
)
const DrawingUpdateToolParameters = Type.Object({
  drawingId: Type.String({ minLength: 1 }),
  patch: DrawingUpdatePatchToolParameters,
})
const DrawingDeleteToolParameters = Type.Object({
  drawingId: Type.String({ minLength: 1 }),
})
const DrawingsListToolParameters = Type.Object({})
const DrawingsClearToolParameters = Type.Object({})

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

/** 将内部图元投影为不含渲染派生坐标与会话态的 Agent 快照。 */
function projectDrawing(drawing: DrawingObject): ChartAgentDrawingSnapshot {
  return Object.freeze({
    id: drawing.id,
    kind: drawing.kind,
    paneId: drawing.paneId,
    visible: drawing.visible,
    locked: drawing.locked ?? false,
    zIndex: drawing.zIndex ?? null,
    anchors: Object.freeze(
      drawing.anchors.map((anchor) =>
        Object.freeze({
          time:
            typeof anchor.time === 'number' && Number.isFinite(anchor.time) ? anchor.time : null,
          price: anchor.price,
        }),
      ),
    ),
    style: Object.freeze({ ...drawing.style }),
  })
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
  private readonly marketDataTextFormatter: MarketDataTextFormatter
  /** 创建图表 Agent facade，并使用图表共享的行情缓存。 */
  constructor(private readonly dependencies: ChartAgentControllerDependencies) {
    this.context = computed(() => this.createContext())
    this.marketDataTextFormatter =
      dependencies.marketDataTextFormatter ?? createMarketDataTextFormatter()
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

  /** 返回当前启用数据源的精确 ID，避免 Agent 根据常见 Provider 名称猜测。 */
  getAvailableMarketDataSourceIds(): ReadonlyArray<string> {
    return this.dependencies.marketDataProviderRegistry
      .getEnabledByPriority()
      .map((provider) => provider.source.id)
  }

  /** 校验显式 sourceId，向 Agent 返回可直接修正下一次调用的可用值。 */
  private requireEnabledMarketDataSource(sourceId: string | undefined): void {
    if (sourceId === undefined) return
    const availableSourceIds = this.getAvailableMarketDataSourceIds()
    if (availableSourceIds.includes(sourceId)) return
    throw new KLineChartError(
      CHART_AGENT_ERROR_CODES.INVALID_QUERY,
      `Unknown or disabled sourceId '${sourceId}'. Available sourceIds: ${availableSourceIds.join(', ') || 'none'}. Omit sourceId to allow automatic routing across every enabled source.`,
    )
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
  queryIndicator(
    input: IndicatorQueryInput,
    _context?: ChartToolExecutionContext,
  ): Promise<string> {
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

  /** 查询任意品种的一页 K 线；底层游标始终使用 UTC 毫秒时间戳。 */
  async queryBars(input: BarsQueryInput, context?: ChartToolExecutionContext): Promise<string> {
    this.requireEnabledMarketDataSource(input.sourceId)
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
    return this.marketDataTextFormatter.formatBars({
      sourceId: result.sourceId,
      instrument: result.instrument,
      series: result.series,
      olderData: result.series.olderData,
    })
  }

  /** 将 Agent 提供的 YYYY-MM-DD UTC 日期游标转换后委托给底层查询。 */
  @Tool({
    name: 'market_bars_query',
    label: 'Query market bars',
    description:
      'Fetch one page of market bars for any symbol without changing the chart. limit must be an integer from 1 to 798. Use before only as an exclusive YYYY-MM-DD UTC date cursor; omit before for the latest bars. Pagination and retries are handled by the cache.',
    parameters: BarsQueryToolParameters,
    safety: 'read-only',
    executionMode: 'parallel',
  })
  queryBarsByDate(input: BarsQueryToolInput, context?: ChartToolExecutionContext): Promise<string> {
    return this.queryBars(
      {
        ...input,
        before: input.before === undefined ? undefined : Date.parse(input.before),
      },
      context,
    )
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
  ): Promise<string> {
    this.requireEnabledMarketDataSource(input.sourceId)
    const result = await this.dependencies.marketDataCache.queryTimeShare({
      sourceId: input.sourceId,
      symbol: input.symbol,
      exchange: input.exchange,
      assetClass: input.assetClass,
      tradingDate: input.tradingDate as TradingDate,
      signal: context?.signal,
    })
    return this.marketDataTextFormatter.formatTimeShare({
      sourceId: result.sourceId,
      instrument: result.instrument,
      series: result.series,
    })
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
  ): Promise<string> {
    this.requireEnabledMarketDataSource(input.sourceId)
    const result = await this.dependencies.marketDataCache.queryTimeShareRange({
      sourceId: input.sourceId,
      symbol: input.symbol,
      exchange: input.exchange,
      assetClass: input.assetClass,
      endTradingDate: input.endTradingDate as TradingDate,
      days: input.days,
      signal: context?.signal,
    })
    return this.marketDataTextFormatter.formatTimeShareRange({
      sourceId: result.sourceId,
      instrument: result.instrument,
      range: result.range,
    })
  }

  /** 返回当前已确认图元，不暴露内部 index 与会话预览。 */
  @Tool({
    name: 'drawings_list',
    label: 'List drawings',
    description:
      'List every committed chart drawing. Anchors use timestamp and price; rendering indexes and interaction previews are not exposed.',
    parameters: DrawingsListToolParameters,
    safety: 'read-only',
    executionMode: 'parallel',
  })
  async listDrawings(
    _input?: Static<typeof DrawingsListToolParameters>,
  ): Promise<ReadonlyArray<ChartAgentDrawingSnapshot>> {
    return this.dependencies.drawingDocument.listDrawings().map(projectDrawing)
  }

  /** 创建一个图表已确认图元。 */
  @Tool({
    name: 'drawing_create',
    label: 'Create drawing',
    description:
      'Create a committed chart drawing using a supported kind, an existing paneId, and timestamp-price anchors. The chart resolves rendering indexes from timestamps.',
    parameters: DrawingCreateToolParameters,
    safety: 'destructive',
    executionMode: 'sequential',
  })
  async createDrawing(
    input: Static<typeof DrawingCreateToolParameters>,
  ): Promise<ChartAgentDrawingSnapshot> {
    return projectDrawing(this.dependencies.drawingDocument.createDrawing(input))
  }

  /** 更新一个图表已确认图元。 */
  @Tool({
    name: 'drawing_update',
    label: 'Update drawing',
    description:
      'Update a committed chart drawing by id. Supply at least one patch field; replacement anchors use timestamp-price coordinates.',
    parameters: DrawingUpdateToolParameters,
    safety: 'destructive',
    executionMode: 'sequential',
  })
  async updateDrawing(
    input: Static<typeof DrawingUpdateToolParameters>,
  ): Promise<ChartAgentDrawingSnapshot | null> {
    const drawing = this.dependencies.drawingDocument.updateDrawing(input.drawingId, input.patch)
    return drawing ? projectDrawing(drawing) : null
  }

  /** 删除一个图表已确认图元。 */
  @Tool({
    name: 'drawing_delete',
    label: 'Delete drawing',
    description: 'Delete one committed chart drawing by id. Returns whether a drawing was removed.',
    parameters: DrawingDeleteToolParameters,
    safety: 'destructive',
    executionMode: 'sequential',
  })
  async deleteDrawing(
    input: Static<typeof DrawingDeleteToolParameters>,
  ): Promise<{ removed: boolean }> {
    return { removed: this.dependencies.drawingDocument.removeDrawing(input.drawingId) }
  }

  /** 清除当前图表的全部已确认图元。 */
  @Tool({
    name: 'drawings_clear',
    label: 'Clear drawings',
    description:
      'Delete every committed chart drawing. Interaction previews are not persisted and are unaffected.',
    parameters: DrawingsClearToolParameters,
    safety: 'destructive',
    executionMode: 'sequential',
  })
  async clearDrawings(
    _input: Static<typeof DrawingsClearToolParameters>,
  ): Promise<{ removed: number }> {
    const removed = this.dependencies.drawingDocument.listDrawings().length
    this.dependencies.drawingDocument.clearDrawings()
    return { removed }
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
