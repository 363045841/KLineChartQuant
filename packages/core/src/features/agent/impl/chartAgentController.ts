// 本文件实现 AI-Native 的 Chart Agent 上下文投影；工具定义见 tools/。

import type { IndicatorInstance } from '@/controllers/types.js'
import { SERIES_SELECTION_KIND } from '@/data/buffer/impl/seriesRepository.js'
import type { TradingDate } from '@/data/provider/types.js'
import type { DrawingObject } from '@/engine/drawing/index.js'
import { ACTIVE_BUFFER_KIND, type DataStateModule } from '@/engine/state/dataState.js'
import { CHART_AGENT_ERROR_CODES, KLineChartError } from '@/errors.js'
import { computed, type ReadonlySignal } from '@/foundation/reactivity/signal.js'
import type {
  ChartAgentActiveIndicator,
  ChartAgentContextSnapshot,
  ChartAgentController,
  ChartAgentControllerDependencies,
  ChartAgentDrawingSelection,
  ChartAgentDrawingSnapshot,
  ChartAgentTimeRange,
  ChartAgentToolDeps,
  MarketDataTextFormatter,
} from '../types.js'
import { createMarketDataTextFormatter } from './marketDataTextFormatter.js'

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
function projectDrawing(
  drawing: DrawingObject,
  placement: string | null,
): ChartAgentDrawingSnapshot {
  return Object.freeze({
    id: drawing.id,
    kind: drawing.kind,
    placement,
    visible: drawing.visible,
    locked: drawing.locked ?? false,
    zIndex: drawing.zIndex ?? null,
    anchors: Object.freeze(
      drawing.anchors.map((anchor) =>
        Object.freeze({
          timestamp:
            typeof anchor.time === 'number' && Number.isFinite(anchor.time) ? anchor.time : null,
          price: anchor.price,
        }),
      ),
    ),
    style: Object.freeze({ ...drawing.style }),
    labels: Object.freeze({
      line: Object.freeze({ ...(drawing.labels?.line ?? {}) }),
      area: Object.freeze({ ...(drawing.labels?.area ?? {}) }),
    }),
  })
}

/** 将当前选中 id 按选择顺序投影为 Agent 可读取的图元快照。 */
function projectDrawingSelection(
  drawings: ReadonlyArray<DrawingObject>,
  selectedIds: ReadonlyArray<string>,
  readPlacement: (paneId: string) => string | null,
): ChartAgentDrawingSelection | null {
  if (selectedIds.length === 0) return null
  const drawingsById = new Map(drawings.map((drawing) => [drawing.id, drawing]))
  const selectedDrawings = selectedIds
    .map((id) => drawingsById.get(id))
    .filter((drawing): drawing is DrawingObject => drawing !== undefined)
    .map((drawing) => projectDrawing(drawing, readPlacement(drawing.paneId)))
  if (selectedDrawings.length === 0) return null
  return Object.freeze({
    selectedIds: Object.freeze(selectedDrawings.map((drawing) => drawing.id)),
    drawings: Object.freeze(selectedDrawings),
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

type AgentSymbolSpec = ReturnType<ChartAgentControllerDependencies['currentSpec']>

/** 返回第一个真值，用于兼容旧 spec 字段与空字符串回退。 */
function firstTruthy<T>(...values: ReadonlyArray<T | null | undefined>): T | null {
  for (const value of values) {
    if (value) return value
  }
  return null
}

/** spec 的标识字段分散在 instrument 与旧平面字段，逐项收敛避免调用方堆叠可选链。 */
function specSymbol(spec: AgentSymbolSpec): string | null {
  return firstTruthy(spec?.instrument?.symbol, spec?.symbol)
}

function specSymbolName(spec: AgentSymbolSpec): string | null {
  return spec?.instrument?.name ?? null
}

function specMarket(spec: AgentSymbolSpec): string | null {
  return spec?.market ?? null
}

function specExchange(spec: AgentSymbolSpec): string | null {
  return firstTruthy(spec?.instrument?.exchange, spec?.exchange)
}

function specDataSource(spec: AgentSymbolSpec, sourceId: string): string | null {
  return firstTruthy(sourceId, spec?.source, spec?.instrument?.sourceId)
}

/** 图表的 Agent 上下文投影；工具能力由 tools/ 声明并注入。 */
class ChartAgentControllerImpl implements ChartAgentController {
  /** 图表状态的响应式只读上下文投影。 */
  readonly context: ReadonlySignal<ChartAgentContextSnapshot | null>
  /** Agent 工具执行所需的领域能力。 */
  readonly tools: ChartAgentToolDeps
  private readonly marketDataTextFormatter: MarketDataTextFormatter
  /** 创建图表 Agent facade，并使用图表共享的行情缓存。 */
  constructor(private readonly dependencies: ChartAgentControllerDependencies) {
    this.context = computed(() => this.createContext())
    this.tools = dependencies.tools
    this.marketDataTextFormatter =
      dependencies.marketDataTextFormatter ?? createMarketDataTextFormatter()
  }

  /** 从 StateKernel 派生当前图表的只读上下文。 */
  private createContext(): ChartAgentContextSnapshot | null {
    const activeBuffer = this.dependencies.dataState.readonly.activeBuffer()
    if (activeBuffer.kind === ACTIVE_BUFFER_KIND.empty || activeBuffer.data.length === 0)
      return null

    const spec = this.dependencies.currentSpec()
    const dataRange = requireTimestampRange(activeBuffer.data)
    const selection = activeBuffer.selection
    const symbol = specSymbol(spec)
    const symbolName = specSymbolName(spec)
    const market = specMarket(spec)
    const exchange = specExchange(spec)
    const dataSource = specDataSource(spec, selection.sourceId)
    const period = this.dependencies.chartMode()
    const adjustMode =
      selection.kind === SERIES_SELECTION_KIND.bars ? selection.adjustment : (spec?.adjust ?? null)
    const timezone = activeBuffer.timezone
    const visibleRange = this.dependencies.selectedRange()
    const drawingSelection = projectDrawingSelection(
      this.dependencies.drawings(),
      this.dependencies.selectedDrawingIds(),
      this.dependencies.readPlacement,
    )

    return Object.freeze({
      chartId: this.dependencies.chartId,
      symbol,
      symbolName,
      market,
      exchange,
      period,
      dataSource,
      timezone,
      adjustMode,
      dataRange: Object.freeze({ ...dataRange, bars: activeBuffer.data.length }),
      visibleRange,
      selectedKLineBars: this.formatSelectedKLineBars(activeBuffer, symbol, visibleRange),
      activeIndicators: projectIndicators(this.dependencies.indicators()),
      drawingSelection,
      dataRevision: activeBuffer.dataRevision,
    })
  }

  /** 使用查询工具相同的 formatter 投影当前选定范围内的已加载 K 线。 */
  private formatSelectedKLineBars(
    activeBuffer: ReturnType<DataStateModule['readonly']['activeBuffer']>,
    symbol: string | null,
    visibleRange: ChartAgentTimeRange | null,
  ): string | null {
    if (activeBuffer.kind !== ACTIVE_BUFFER_KIND.bars || !symbol || !visibleRange) return null
    const data = activeBuffer.data.filter(
      (item) => item.timestamp >= visibleRange.from && item.timestamp <= visibleRange.to,
    )
    if (data.length === 0) return null
    return this.marketDataTextFormatter.formatChartBars({
      sourceId: activeBuffer.selection.sourceId,
      symbol,
      period: activeBuffer.selection.period,
      adjustment: activeBuffer.selection.adjustment,
      timezone: activeBuffer.timezone,
      data,
      olderData: null,
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
}

/** 创建稳定的 Chart Agent facade。 */
export function createChartAgentController(
  dependencies: ChartAgentControllerDependencies,
): ChartAgentController {
  return new ChartAgentControllerImpl(dependencies)
}
