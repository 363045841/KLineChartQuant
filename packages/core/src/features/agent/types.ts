/** Agent 查询品种目录与行情数据的输入。 */
import type {
  AssetClass,
  BarSeries,
  InstrumentDescriptor,
  KLineAdjustment,
  KLinePeriod,
  OlderDataStatus,
  TimeShareRange,
  TimeShareSeries,
} from '../../data/provider/types'
import type { ReadonlySignal } from '../../foundation/reactivity/signal'
import type { ChartToolExecutionContext } from './chartToolRegistry'

/** Inclusive timestamp range exposed to Agent consumers. */
export interface ChartAgentTimeRange {
  readonly from: number
  readonly to: number
}

/** Loaded timestamp coverage and bar count. */
export interface ChartAgentDataRange extends ChartAgentTimeRange {
  readonly bars: number
}

/** Serializable active-indicator projection. */
export interface ChartAgentActiveIndicator {
  readonly instanceId: string
  readonly definitionId: string
  readonly params: Readonly<Record<string, number>>
}

/** Minimum sufficient, detached chart context for Agent runs and tools. */
export interface ChartAgentContextSnapshot {
  readonly chartId: string
  readonly symbol: string | null
  readonly market: string | null
  readonly exchange: string | null
  readonly period: string | null
  readonly dataSource: string | null
  readonly timezone: string | null
  readonly adjustMode: string | null
  readonly dataRange: ChartAgentDataRange
  readonly visibleRange: ChartAgentTimeRange | null
  readonly activeIndicators: ReadonlyArray<ChartAgentActiveIndicator>
  readonly dataRevision: number
}

/** Bounded parameters accepted by the compact indicator query. */
export interface IndicatorQueryInput {
  readonly definitionId: string
  readonly params?: Readonly<Record<string, number>>
  readonly from?: number
  readonly to?: number
  readonly limit?: number
}

/** Agent 查询标准品种目录的输入。 */
export interface InstrumentSearchInput {
  readonly keyword: string
  readonly limit: number
  readonly sourceIds?: ReadonlyArray<string>
  readonly signal?: AbortSignal
}

/** Agent 按标准代码精确查询品种目录的输入。 */
export interface InstrumentLookupInput {
  readonly symbol: string
  readonly sourceIds?: ReadonlyArray<string>
  readonly signal?: AbortSignal
}

/** 无状态 K 线游标查询输入；拉多少就请求多少，不依赖当前图表选择或视口。 */
export interface BarsQueryInput {
  readonly symbol: string
  readonly period: KLinePeriod
  readonly adjustment: KLineAdjustment
  readonly limit: number
  readonly sourceId?: string
  readonly exchange?: string
  readonly assetClass?: AssetClass
  readonly before?: number
}

/** 单日分时查询输入；交易日必须由调用方显式给出。 */
export interface TimeShareQueryInput {
  readonly symbol: string
  readonly tradingDate: string
  readonly sourceId?: string
  readonly exchange?: string
  readonly assetClass?: AssetClass
}

/** 多日分时查询输入；截止交易日与天数必须由调用方显式给出。 */
export interface TimeShareRangeQueryInput {
  readonly symbol: string
  readonly endTradingDate: string
  readonly days: number
  readonly sourceId?: string
  readonly exchange?: string
  readonly assetClass?: AssetClass
}

/** 行情查询的可序列化来源信息。 */
export interface MarketDataQueryMeta {
  readonly sourceId: string
  readonly instrument: InstrumentDescriptor
}

/** 无状态 K 线查询结果。 */
export interface BarsQueryResult extends MarketDataQueryMeta {
  readonly series: BarSeries
  readonly olderData: OlderDataStatus
}

/** 无状态单日分时查询结果。 */
export interface TimeShareQueryResult extends MarketDataQueryMeta {
  readonly series: TimeShareSeries
}

/** 无状态多日分时查询结果。 */
export interface TimeShareRangeQueryResult extends MarketDataQueryMeta {
  readonly range: TimeShareRange
}

/** Stable Agent-facing facade attached to every ChartController. */
export interface ChartAgentController {
  /** 图表状态的只读上下文投影；无有效行情数据时为 null。 */
  readonly context: ReadonlySignal<ChartAgentContextSnapshot | null>
  getContext(): ChartAgentContextSnapshot
  queryIndicator(input: IndicatorQueryInput): Promise<string>
  searchInstruments(input: InstrumentSearchInput): Promise<ReadonlyArray<InstrumentDescriptor>>
  lookupInstrumentsBySymbol(
    input: InstrumentLookupInput,
    context?: ChartToolExecutionContext,
  ): Promise<ReadonlyArray<InstrumentDescriptor>>
  queryBars(input: BarsQueryInput, context?: ChartToolExecutionContext): Promise<BarsQueryResult>
  queryTimeShare(
    input: TimeShareQueryInput,
    context?: ChartToolExecutionContext,
  ): Promise<TimeShareQueryResult>
  queryTimeShareRange(
    input: TimeShareRangeQueryInput,
    context?: ChartToolExecutionContext,
  ): Promise<TimeShareRangeQueryResult>
}
