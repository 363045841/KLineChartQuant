/** Agent 功能模块的对外契约：查询输入输出、facade 接口与依赖接口；实现位于 impl/。 */
import type {
  DrawingKind,
  DrawingTimeframeVisibility,
  DrawingWorkspaceId,
} from '@363045841yyt/klinechart-plot-contracts'
import type { IndicatorInstance, IndicatorParamDef, SymbolSpec } from '../../controllers/types.js'
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
import type { KLineData } from '../../foundation/types/price.js'

/** Inclusive timestamp range exposed to Agent consumers. */
export interface ChartAgentTimeRange {
  readonly from: number
  readonly to: number
}

/**
 * 宿主真正投影进 Agent 上下文的最小快照。
 *
 * 只保留 `projectContextItems` 会读取的字段：标的、时区、可见范围、范围内的 K 线文本
 * 与当前选中的图元。不在这里重复渲染状态或身份，避免出现无人消费的字段。
 */
export interface ChartAgentContextSnapshot {
  readonly symbol: string | null
  readonly symbolName: string | null
  readonly timezone: string | null
  readonly visibleRange: ChartAgentTimeRange | null
  /** 当前选定时间范围内已加载 K 线的 formatter 文本；无范围或非 K 线视图时为 null。 */
  readonly selectedKLineBars: string | null
  /** 当前选中图元；无选择时为 null。 */
  readonly drawingSelection: ChartAgentDrawingSelection | null
}

/**
 * Agent 读写的图元锚点。
 *
 * 坐标轴由 kind 决定：垂直线只有 time，水平线只有 price，其余种类两者都有。
 * 该 kind 不使用的轴不会出现在对象里，调用方不需要为一个不参与定位的字段编值。
 */
export interface ChartAgentDrawingAnchor {
  /** RFC 3339 带偏移量的图表时间，与 drawings_list 返回的字符串完全同形。 */
  readonly time?: string
  readonly price?: number
}

/** Agent 可读写的绘图附属文本完整快照。 */
export interface ChartAgentDrawingLabels {
  readonly line: Readonly<DrawingLabels['line']>
  readonly area: Readonly<DrawingLabels['area']>
}

/** Agent 可读取的已确认图元快照；身份是系统分配的 id，落点是显示行。 */
export interface ChartAgentDrawingSnapshot {
  readonly id: string
  readonly kind: DrawingKind
  /** 图表显示行：0 是最上面一行；主图可能在任何行。 */
  readonly row: number
  readonly visible: boolean
  readonly locked: boolean
  readonly zIndex: number | null
  readonly anchors: ReadonlyArray<ChartAgentDrawingAnchor>
  readonly style: Readonly<Record<string, string | number | undefined>>
  readonly labels: ChartAgentDrawingLabels
  readonly timeframeVisibility: DrawingTimeframeVisibility
}

/** 工具返回的图元视图：文档快照加上当前周期的可见性。 */
export interface ChartAgentDrawingView extends ChartAgentDrawingSnapshot {
  readonly visibleInCurrentPeriod: boolean
}

/** 图元列表：附带读取时刻的时区与周期，模型据此理解返回值而不必自行推断。 */
export interface ChartAgentDrawingList {
  readonly timezone: string
  readonly period: string
  readonly drawings: ReadonlyArray<ChartAgentDrawingView>
}

/** Agent 可读取的当前绘图选择。 */
export interface ChartAgentDrawingSelection {
  readonly selectedIds: ReadonlyArray<string>
  readonly drawings: ReadonlyArray<ChartAgentDrawingSnapshot>
}

/** Agent 看到的单个指标实例；身份由位置表达，不暴露内部实例 ID。 */
export interface ChartAgentIndicatorView {
  readonly indicator: string
  readonly params: Readonly<Record<string, unknown>>
  /** 主图叠加或副图指标；由 pane 身份决定，不由行号推导。 */
  readonly placement: IndicatorPlacement
  /** 图表显示行：0 是最上面一行；主图可能在任何行。 */
  readonly row: number
  /** 同一行内的第几个指标，从 1 开始。 */
  readonly order: number
}

/** 指标定位：按名称定位，同名多实例时用 row / order 收敛。 */
export interface ChartAgentIndicatorTarget {
  readonly indicator: string
  readonly row?: number
  readonly order?: number
}

/** 可解析的指标定义：规范名称与参数声明一起返回，调用方不自行推断参数键。 */
export interface ChartAgentIndicatorDefinition {
  readonly indicator: string
  readonly params: ReadonlyArray<IndicatorParamDef>
}

/** Bounded parameters accepted by the compact indicator query. */
export interface IndicatorQueryInput {
  readonly definitionId: string
  readonly params?: Readonly<Record<string, number>>
  readonly limit?: number
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

/** 指标实例命令面：按名称定位，身份由状态分配并在内部解析。 */
export interface ChartAgentIndicatorCommands {
  list(): ReadonlyArray<ChartAgentIndicatorView>
  add(
    indicator: string,
    params?: Readonly<Record<string, unknown>>,
    placement?: IndicatorPlacement,
  ): ChartAgentIndicatorView
  /** 按名称与位置读取单个指标；零个或多个命中时报可纠正错误。 */
  read(target: ChartAgentIndicatorTarget): ChartAgentIndicatorView
  update(
    target: ChartAgentIndicatorTarget,
    params: Readonly<Record<string, unknown>>,
  ): ChartAgentIndicatorView
  move(target: ChartAgentIndicatorTarget, row: number): ChartAgentIndicatorView
  remove(target: ChartAgentIndicatorTarget): ChartAgentIndicatorView
  /**
   * 加载并解析可在图表中渲染的指标定义。
   * @returns 规范名称与参数声明；未注册或没有渲染器时为 null。
   */
  resolveDefinition(indicator: string): Promise<ChartAgentIndicatorDefinition | null>
}

/** 图元创建输入：落点用显示行，时间用 RFC 3339。 */
export interface ChartAgentDrawingCreateInput {
  readonly row: number
  readonly kind: DrawingKind
  readonly anchors: ReadonlyArray<ChartAgentDrawingAnchor>
  readonly style: Readonly<Record<string, string | number | undefined>>
  readonly labels?: Readonly<DrawingLabels>
  readonly visible?: boolean
  readonly locked?: boolean
  readonly zIndex?: number
  readonly timeframeVisibility?: DrawingTimeframeVisibility
}

/** 图元补丁：只改属性；几何变化由删除后重建表达。 */
export interface ChartAgentDrawingPatch {
  readonly style?: Readonly<Record<string, string | number | undefined>>
  readonly labels?: Readonly<DrawingLabels>
  readonly visible?: boolean
  readonly locked?: boolean
  readonly zIndex?: number
  readonly timeframeVisibility?: DrawingTimeframeVisibility
}

/** 图元命令面：行号解析与快照投影都在 Core 内完成。 */
export interface ChartAgentDrawingCommands {
  list(): ChartAgentDrawingList
  create(input: ChartAgentDrawingCreateInput): ChartAgentDrawingView
  update(drawingId: string, patch: ChartAgentDrawingPatch): ChartAgentDrawingView
  remove(drawingId: string): ChartAgentDrawingView
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
  readonly dataState: DataStateModule
  readonly currentSpec: ReadonlySignal<SymbolSpec | null>
  readonly selectedRange: ReadonlySignal<ChartAgentTimeRange | null>
  readonly drawings: ReadonlySignal<ReadonlyArray<DrawingObject>>
  readonly selectedDrawingIds: ReadonlySignal<ReadonlyArray<string>>
  /** 把 Pane 反向投影为显示行；不在图表布局内时返回 null。 */
  readonly readPaneRow: (paneId: string) => number | null
  /** 绝对时间戳 → RFC 3339（图表时区）。 */
  readonly formatAnchorTime: (timestamp: number) => string
  readonly tools: ChartAgentToolDeps
  readonly marketDataTextFormatter?: MarketDataTextFormatter
}

/** 图元命令看到的图表作用域：行、周期、时区与工作区一次取齐。 */
export interface ChartAgentDrawingScope {
  /** 显示行 → Pane；索引即行号。 */
  readonly rows: ReadonlyArray<string>
  readonly period: string
  readonly timezone: string
  readonly workspace: DrawingWorkspaceId
}

/** 图元命令面的装配依赖。 */
export interface ChartAgentDrawingCommandsDependencies {
  readonly drawingDocument: Pick<DrawingDocument, 'listCurrentDrawings' | 'getDrawing'>
  readonly drawingCommands: Pick<DrawingCommands, 'create' | 'updateFromInput' | 'remove'>
  /** 当前图表作用域；行号、周期、时区与工作区只有一个来源。 */
  readonly scope: () => ChartAgentDrawingScope
  /** 当前已加载的 K 线；日期简写按它查表。 */
  readonly bars: () => ReadonlyArray<{ readonly date?: string; readonly timestamp: number }>
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
    instances: ReadonlySignal<ReadonlyArray<IndicatorInstance>>
  }
  readonly panes: {
    getLayoutSpecs(): ReadonlyArray<{ readonly id: string }>
  }
  readonly loadIndicators: (indicatorIds: ReadonlyArray<string>) => Promise<void>
  readonly resolveCanonicalId: (indicatorId: string) => string | null
  readonly isRendererAvailable: (indicatorId: string) => boolean
  /** 读取规范 ID 对应的参数声明；目录项缺失时返回 undefined。 */
  readonly readParamDefs: (indicatorId: string) => ReadonlyArray<IndicatorParamDef> | undefined
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
