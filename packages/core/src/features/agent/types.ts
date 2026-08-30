/** Agent 查询品种目录的输入。 */
import type { InstrumentDescriptor } from '../../data/provider/types'
import type { ReadonlySignal } from '../../foundation/reactivity/signal'

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

/** Stable Agent-facing facade attached to every ChartController. */
export interface ChartAgentController {
  /** 图表状态的只读上下文投影；无有效行情数据时为 null。 */
  readonly context: ReadonlySignal<ChartAgentContextSnapshot | null>
  getContext(): ChartAgentContextSnapshot
  queryIndicator(input: IndicatorQueryInput): Promise<string>
  searchInstruments(input: InstrumentSearchInput): Promise<ReadonlyArray<InstrumentDescriptor>>
}
