/** Agent 功能模块的对外契约：查询输入输出、facade 接口与依赖接口；实现位于 impl/。 */
import type { IndicatorInstance, SymbolSpec } from '../../controllers/types.js'
import type { MarketDataCache } from '../../data/buffer/marketDataCache.js'
import type { MarketDataProviderRegistry } from '../../data/provider/registry.js'
import type {
  AssetClass,
  BarAggregation,
  BarSeries,
  InstrumentDescriptor,
  KLineAdjustment,
  KLinePeriod,
  OlderDataStatus,
  TimeShareRange,
  TimeShareSeries,
} from '../../data/provider/types.js'
import type { ComparisonCommands } from '../../engine/data/comparisonCommands.js'
import type { DrawingCommands } from '../../engine/drawing/DrawingCommands.js'
import type { DrawingDocument } from '../../engine/drawing/DrawingDocument.js'
import type { IndicatorMetadata } from '../../engine/indicators/indicatorMetadata.js'
import type { PaneManager } from '../../engine/paneManager.js'
import type { DataStateModule } from '../../engine/state/dataState.js'
import type { ChartToolExecutionContext } from '../../foundation/agent/chartToolRegistry.js'
import type { DrawingLabels, DrawingObject } from '../../foundation/plugin/index.js'
import type { ReadonlySignal } from '../../foundation/reactivity/signal.js'
import type { ChartDataView } from '../../foundation/types/chartView.js'
import type { KLineData } from '../../foundation/types/price.js'

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
  readonly symbolName: string | null
  readonly market: string | null
  readonly exchange: string | null
  readonly period: string | null
  readonly dataSource: string | null
  readonly timezone: string | null
  readonly adjustMode: string | null
  readonly dataRange: ChartAgentDataRange
  readonly visibleRange: ChartAgentTimeRange | null
  /** 当前选定时间范围内已加载 K 线的 formatter 文本；无范围或非 K 线视图时为 null。 */
  readonly selectedKLineBars: string | null
  readonly activeIndicators: ReadonlyArray<ChartAgentActiveIndicator>
  /** 当前选中图元；无选择时为 null。 */
  readonly drawingSelection: ChartAgentDrawingSelection | null
  readonly dataRevision: number
}

/** Agent 可读取的绘图锚点快照；渲染派生 index 不属于公共协议。 */
export interface ChartAgentDrawingAnchor {
  readonly timestamp: number | null
  readonly price: number
}

/** Agent 可读写的绘图附属文本完整快照。 */
export interface ChartAgentDrawingLabels {
  readonly line: Readonly<DrawingLabels['line']>
  readonly area: Readonly<DrawingLabels['area']>
}

/** Agent 可读取的已确认图元快照。 */
export interface ChartAgentDrawingSnapshot {
  readonly id: string
  readonly kind: string
  readonly paneId: string
  readonly visible: boolean
  readonly locked: boolean
  readonly zIndex: number | null
  readonly anchors: ReadonlyArray<ChartAgentDrawingAnchor>
  readonly style: Readonly<Record<string, string | number | undefined>>
  readonly labels: ChartAgentDrawingLabels
}

/** Agent 可读取的当前绘图选择。 */
export interface ChartAgentDrawingSelection {
  readonly selectedIds: ReadonlyArray<string>
  readonly drawings: ReadonlyArray<ChartAgentDrawingSnapshot>
}

/** Bounded parameters accepted by the compact indicator query. */
export interface IndicatorQueryInput {
  readonly definitionId: string
  readonly params?: Readonly<Record<string, number>>
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

/** 无状态最新 K 线查询输入；拉多少就请求多少，不依赖当前图表选择或视口。 */
export interface BarsQueryInput {
  readonly symbol: string
  readonly period: KLinePeriod
  readonly adjustment: KLineAdjustment
  readonly barAggregation: BarAggregation
  readonly limit: number
  readonly sourceId?: string
  readonly exchange?: string
  readonly assetClass?: AssetClass
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
  /** 已注册 @Tool 方法、但不属于本 facade 的原语宿主；Agent runtime 据此解析执行目标。 */
  readonly toolHosts: ReadonlyArray<object>
  getContext(): ChartAgentContextSnapshot
  /** 返回当前可创建图元的 pane ID，供 Agent 修正绘图请求。 */
  getAvailableDrawingPaneIds(): ReadonlyArray<string>
  /** 返回当前启用数据源的精确 ID，供 Agent 生成合法的 sourceId 参数。 */
  getAvailableMarketDataSourceIds(): ReadonlyArray<string>
  queryIndicator(input: IndicatorQueryInput): Promise<string>
  searchInstruments(input: InstrumentSearchInput): Promise<ReadonlyArray<InstrumentDescriptor>>
  lookupInstrumentsBySymbol(
    input: InstrumentLookupInput,
    context?: ChartToolExecutionContext,
  ): Promise<string>
  queryBars(input: BarsQueryInput, context?: ChartToolExecutionContext): Promise<string>
  queryTimeShare(input: TimeShareQueryInput, context?: ChartToolExecutionContext): Promise<string>
  queryTimeShareRange(
    input: TimeShareRangeQueryInput,
    context?: ChartToolExecutionContext,
  ): Promise<string>
  listDrawings(): Promise<ReadonlyArray<ChartAgentDrawingSnapshot>>
}

/** Chart Agent facade 的构造依赖；由宿主组装后注入。 */
export interface ChartAgentControllerDependencies {
  readonly chartId: string
  readonly dataState: DataStateModule
  readonly currentSpec: ReadonlySignal<SymbolSpec | null>
  readonly chartMode: ReadonlySignal<ChartDataView>
  readonly selectedRange: ReadonlySignal<ChartAgentTimeRange | null>
  readonly indicators: ReadonlySignal<ReadonlyArray<IndicatorInstance>>
  readonly indicatorQuery: IndicatorQuery
  readonly marketDataProviderRegistry: MarketDataProviderRegistry
  readonly marketDataCache: MarketDataCache
  readonly drawingDocument: DrawingDocument
  readonly drawingCommands: DrawingCommands
  readonly drawings: ReadonlySignal<ReadonlyArray<DrawingObject>>
  readonly selectedDrawingIds: ReadonlySignal<ReadonlyArray<string>>
  readonly getDrawingPaneIds: () => ReadonlyArray<string>
  readonly paneManager: Pick<PaneManager, 'actions' | 'list'>
  /** 对比品种唯一写原语；其 @Tool 方法即为 Agent 工具。 */
  readonly comparisonCommands: ComparisonCommands
  /** 将 UI 或 Agent 传入的指标别名解析为注册表中的规范 ID。 */
  readonly resolveSubPaneIndicatorId: (indicatorId: string) => string | null
  readonly isSubPaneRendererAvailable: (indicatorId: string, paneId: string) => boolean
  readonly marketDataTextFormatter?: MarketDataTextFormatter
}

/** 市场查询文本转义服务。 */
export interface MarketDataTextFormatter {
  formatBars(result: BarsQueryResult): string
  formatChartBars(input: ChartBarsTextFormatInput): string
  formatInstrumentLookup(input: InstrumentLookupTextFormatInput): string
  formatTimeShare(result: TimeShareQueryResult): string
  formatTimeShareRange(result: TimeShareRangeQueryResult): string
}

/** 当前图表 K 线投影为 Agent 文本时所需的最小行情元数据。 */
export interface ChartBarsTextFormatInput {
  readonly sourceId: string
  readonly symbol: string
  readonly period: KLinePeriod
  readonly adjustment: KLineAdjustment
  readonly timezone: string | null
  readonly data: ReadonlyArray<KLineData>
  readonly olderData: OlderDataStatus | null
}

/** 精确品种查询投影为 Agent 文本时的输入。 */
export interface InstrumentLookupTextFormatInput {
  readonly symbol: string
  readonly instruments: ReadonlyArray<InstrumentDescriptor>
}

/** 指标计算的内部输入，可按时间范围筛选结果；不作为 Agent 工具契约暴露。 */
export type IndicatorCalculationQueryInput = IndicatorQueryInput & {
  readonly from?: number
  readonly to?: number
}

/** 调用既有指标计算链路并返回紧凑文本的查询服务。 */
export interface IndicatorQuery {
  queryIndicator(input: IndicatorCalculationQueryInput): Promise<string>
}

/** 指标查询服务依赖，允许测试或宿主替换指标定义解析器和文本转义器。 */
export interface IndicatorQueryDependencies {
  readonly dataState: DataStateModule
  readonly resolveDefinition?: (
    definitionId: string,
  ) => Pick<IndicatorMetadata, 'name' | 'runtime'> | undefined
  readonly textFormatter?: IndicatorTextFormatter
}

/** 指标文本转义器的输入，不属于 Agent 公开返回契约。 */
export interface IndicatorTextFormatContext {
  readonly definitionId: string
  readonly params: Readonly<Record<string, unknown>>
  readonly timestamps: ReadonlyArray<number>
  readonly series: unknown
  readonly from: number
  readonly to: number
  readonly limit: number
}

/** 单个指标结果的文本转义函数。 */
export type IndicatorResultFormatter = (context: IndicatorTextFormatContext) => string

/** 指标文本转义服务。 */
export interface IndicatorTextFormatter {
  format(context: IndicatorTextFormatContext): string
}
