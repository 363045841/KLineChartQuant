/** Agent 功能模块的对外契约：查询输入输出、facade 接口与依赖接口；实现位于 impl/。 */
import type { IndicatorInstance, SymbolSpec } from '../../controllers/types.js'
import type { MarketDataCache } from '../../data/buffer/impl/marketDataCache.js'
import type { MarketDataProviderRegistry } from '../../data/provider/impl/registry.js'
import type {
  BarAggregation,
  BarSeries,
  InstrumentDescriptor,
  InstrumentType,
  KLineAdjustment,
  KLinePeriod,
  OlderDataStatus,
  TimeShareRange,
  TimeShareSeries,
} from '../../data/provider/types.js'
import type { ComparisonCommandsApi } from '../../engine/data/comparisonCommands.js'
import type {
  DrawingCommands,
  DrawingDocument,
  DrawingLabels,
  DrawingObject,
} from '../../engine/drawing/index.js'
import type { IndicatorMetadata } from '../../engine/indicators/indicatorMetadata.js'
import type { IndicatorPlacement } from '../../engine/pane/types.js'
import type { DataStateModule } from '../../engine/state/dataState.js'
import type { ChartToolExecutionContext } from '../../foundation/agent/index.js'
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

/**
 * 图元的落点。
 *
 * main 表示主图；其余取值是指标实例身份，代表该实例独占的副图。
 * Agent 只能寻址主图与已存在的指标副图，其它容器属于宿主界面。
 */
export type ChartAgentPlacement = string

/** Agent 可读取的已确认图元快照。 */
export interface ChartAgentDrawingSnapshot {
  readonly id: string
  readonly kind: string
  /** 图元所在落点；无法用 Agent 词汇表寻址时为 null。 */
  readonly placement: ChartAgentPlacement | null
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

/** Agent 看到的单个指标实例；身份、落点与参数都在这里。 */
export interface ChartAgentIndicatorView {
  readonly instanceId: string
  readonly definitionId: string
  readonly params: Readonly<Record<string, unknown>>
  readonly placement: IndicatorPlacement
  /** 所在栏的 0 起顺序；主图叠加的指标为 null。 */
  readonly row: number | null
}

/** 指标实例的可写补丁；换指标时 params 会按新定义补齐默认值。 */
export interface ChartAgentIndicatorPatch {
  readonly definitionId?: string
  readonly params?: Readonly<Record<string, unknown>>
  readonly placement?: IndicatorPlacement
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
  readonly instrumentType?: InstrumentType
}

/** 单日分时查询输入；交易日必须由调用方显式给出。 */
export interface TimeShareQueryInput {
  readonly symbol: string
  readonly tradingDate: string
  readonly sourceId?: string
  readonly exchange?: string
  readonly instrumentType?: InstrumentType
}

/** 多日分时查询输入；截止交易日与天数必须由调用方显式给出。 */
export interface TimeShareRangeQueryInput {
  readonly symbol: string
  readonly endTradingDate: string
  readonly days: number
  readonly sourceId?: string
  readonly exchange?: string
  readonly instrumentType?: InstrumentType
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

/** 指标实例命令面：身份由状态分配，落点用语义表达。 */
export interface ChartAgentIndicatorCommands {
  list(): ReadonlyArray<ChartAgentIndicatorView>
  add(
    definitionId: string,
    params?: Readonly<Record<string, unknown>>,
    placement?: IndicatorPlacement,
  ): string
  update(instanceId: string, patch: ChartAgentIndicatorPatch): boolean
  move(instanceId: string, row: number): boolean
  remove(instanceId: string): boolean
  clear(): number
  /**
   * 加载并解析可在图表中渲染的指标定义。
   * @returns 规范定义 ID；未注册或没有渲染器时为 null。
   */
  resolveDefinition(definitionId: string): Promise<string | null>
}

/** 图元写入输入：落点用 Agent 词汇表，锚点用交易日或价格。 */
export interface ChartAgentDrawingCreateInput {
  readonly placement: ChartAgentPlacement
  readonly kind: string
  readonly anchors: ReadonlyArray<{ readonly tradingDate?: string; readonly price: number }>
  readonly style: Readonly<Record<string, string | number | undefined>>
  readonly labels?: Readonly<DrawingLabels>
  readonly visible?: boolean
  readonly locked?: boolean
  readonly zIndex?: number
}

/** 图元补丁：可改锚点、样式、标签与显隐。 */
export interface ChartAgentDrawingPatch {
  readonly anchors?: ReadonlyArray<{ readonly tradingDate?: string; readonly price: number }>
  readonly style?: Readonly<Record<string, string | number | undefined>>
  readonly labels?: ChartAgentDrawingCreateInput['labels']
  readonly visible?: boolean
  readonly locked?: boolean
  readonly zIndex?: number
}

/** 图元命令面：落点解析与快照投影都在 Core 内完成。 */
export interface ChartAgentDrawingCommands {
  list(): ReadonlyArray<ChartAgentDrawingSnapshot>
  create(input: ChartAgentDrawingCreateInput): ChartAgentDrawingSnapshot
  update(drawingId: string, patch: ChartAgentDrawingPatch): ChartAgentDrawingSnapshot | null
  remove(drawingId: string): boolean
  copy(drawingIds: ReadonlyArray<string>): ReadonlyArray<ChartAgentDrawingSnapshot>
  clear(): number
}

/** 无状态行情查询面；不读取也不修改当前图表选择。 */
export interface ChartAgentMarketQueries {
  listSourceIds(): ReadonlyArray<string>
  lookupInstrument(
    input: InstrumentLookupInput,
    context?: ChartToolExecutionContext,
  ): Promise<string>
  bars(input: BarsQueryInput, context?: ChartToolExecutionContext): Promise<string>
  timeShare(
    input: TimeShareQueryInput & { readonly days: number },
    context?: ChartToolExecutionContext,
  ): Promise<string>
  indicatorValues(input: IndicatorQueryInput): Promise<string>
}

/** Agent 工具执行所需的全部领域能力；由图表组合根一次装配。 */
export interface ChartAgentToolDeps {
  readonly indicators: ChartAgentIndicatorCommands
  readonly drawings: ChartAgentDrawingCommands
  readonly comparisons: ComparisonCommandsApi
  readonly market: ChartAgentMarketQueries
}

/** Stable Agent-facing facade attached to every ChartController. */
export interface ChartAgentController {
  /** 图表状态的只读上下文投影；无有效行情数据时为 null。 */
  readonly context: ReadonlySignal<ChartAgentContextSnapshot | null>
  /** Agent 工具执行所需的领域能力。 */
  readonly tools: ChartAgentToolDeps
  getContext(): ChartAgentContextSnapshot
}

/** Chart Agent facade 的构造依赖；由宿主组装后注入。 */
export interface ChartAgentControllerDependencies {
  readonly chartId: string
  readonly dataState: DataStateModule
  readonly currentSpec: ReadonlySignal<SymbolSpec | null>
  readonly chartMode: ReadonlySignal<ChartDataView>
  readonly selectedRange: ReadonlySignal<ChartAgentTimeRange | null>
  readonly indicators: ReadonlySignal<ReadonlyArray<IndicatorInstance>>
  readonly drawings: ReadonlySignal<ReadonlyArray<DrawingObject>>
  readonly selectedDrawingIds: ReadonlySignal<ReadonlyArray<string>>
  /** 把 Pane 反向投影为 Agent 落点；不可寻址时返回 null。 */
  readonly readPlacement: (paneId: string) => string | null
  readonly tools: ChartAgentToolDeps
  readonly marketDataTextFormatter?: MarketDataTextFormatter
}

/** 图元命令面的装配依赖。 */
export interface ChartAgentDrawingCommandsDependencies {
  readonly drawingDocument: Pick<DrawingDocument, 'listDrawings'>
  readonly drawingCommands: Pick<DrawingCommands, 'create' | 'updateFromInput' | 'remove' | 'clear'>
  readonly copyDrawings: (ids: ReadonlyArray<string>) => ReadonlyArray<DrawingObject>
  /** 把主图与指标实例解析为 Pane；不可寻址时返回 null。 */
  readonly resolvePaneId: (placement: ChartAgentPlacement) => string | null
  /** 把 Pane 反向投影为 Agent 落点；不可寻址时返回 null。 */
  readonly readPlacement: (paneId: string) => ChartAgentPlacement | null
}

/** 指标命令面的装配依赖。 */
export interface ChartAgentIndicatorCommandsDependencies {
  readonly facade: {
    add(
      definitionId: string,
      params?: Readonly<Record<string, unknown>>,
      placement?: IndicatorPlacement,
    ): string | null
    update(
      instanceId: string,
      patch: {
        indicatorId?: string
        params?: Readonly<Record<string, unknown>>
        hidden?: boolean
      },
    ): boolean
    move(
      instanceId: string,
      target: {
        kind: 'pane'
        paneId: string
        index?: number
      },
    ): boolean
    remove(instanceId: string): boolean
    clear(): void
    instances: ReadonlySignal<ReadonlyArray<IndicatorInstance>>
  }
  readonly panes: {
    getLayoutSpecs(): ReadonlyArray<{ readonly id: string }>
    movePane(paneId: string, targetIndex: number): boolean
    addPane(anchorPaneId: string, placement: 'above' | 'below'): string | null
    removePane(paneId: string): boolean
  }
  readonly loadIndicators: (indicatorIds: ReadonlyArray<string>) => Promise<void>
  readonly resolveCanonicalId: (indicatorId: string) => string | null
  readonly isRendererAvailable: (indicatorId: string) => boolean
}

/** 行情查询面的装配依赖。 */
export interface ChartAgentMarketQueriesDependencies {
  /** 当前启用数据源的精确 ID；用于白名单校验与描述提示。 */
  readonly sources: () => ReadonlyArray<string>
  /** 按代码精确查询品种；由组合根绑定当前数据源注册表。 */
  readonly lookup: (input: InstrumentLookupInput) => Promise<ReadonlyArray<InstrumentDescriptor>>
  readonly cache: Pick<MarketDataCache, 'queryBars' | 'queryTimeShare' | 'queryTimeShareRange'>
  readonly formatter: MarketDataTextFormatter
  readonly indicatorQuery: IndicatorQuery
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
