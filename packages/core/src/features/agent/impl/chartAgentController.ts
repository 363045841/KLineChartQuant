// 本文件实现 AI-Native 的 Chart Agent 上下文投影；工具定义见 tools/。

import type { DrawingObject } from '@/engine/drawing/index.js'
import { ACTIVE_BUFFER_KIND, type DataStateModule } from '@/engine/state/dataState.js'
import { CHART_AGENT_ERROR_CODES, KLineChartError } from '@/errors.js'
import { computed, type ReadonlySignal } from '@/foundation/reactivity/signal.js'
import type {
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
import { projectDrawingSnapshot } from './drawingSnapshot.js'

/** 将当前选中 id 按选择顺序投影为 Agent 可读取的图元快照。 */
function projectDrawingSelection(
  drawings: ReadonlyArray<DrawingObject>,
  selectedIds: ReadonlyArray<string>,
  readPaneRow: (paneId: string) => number | null,
  formatAnchorTime: (timestamp: number) => string,
): ChartAgentDrawingSelection | null {
  if (selectedIds.length === 0) return null
  const drawingsById = new Map(drawings.map((drawing) => [drawing.id, drawing]))
  const selectedDrawings: ChartAgentDrawingSnapshot[] = []
  for (const id of selectedIds) {
    const drawing = drawingsById.get(id)
    if (drawing === undefined) continue
    const row = readPaneRow(drawing.paneId)
    if (row === null) continue
    selectedDrawings.push(projectDrawingSnapshot(drawing, row, formatAnchorTime))
  }
  if (selectedDrawings.length === 0) return null
  return Object.freeze({
    selectedIds: Object.freeze(selectedDrawings.map((drawing) => drawing.id)),
    drawings: Object.freeze(selectedDrawings),
  })
}

type AgentSymbolSpec = ReturnType<ChartAgentControllerDependencies['currentSpec']>

/** spec 的标识字段分散在 instrument 与旧平面字段，逐项收敛避免调用方堆叠可选链。 */
function specSymbol(spec: AgentSymbolSpec): string | null {
  return spec?.instrument?.symbol || spec?.symbol || null
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
    const symbol = specSymbol(spec)
    const timezone = activeBuffer.timezone
    const visibleRange = this.dependencies.selectedRange()

    return Object.freeze({
      symbol,
      symbolName: spec?.instrument?.name ?? null,
      timezone,
      visibleRange,
      selectedKLineBars: this.formatSelectedKLineBars(activeBuffer, symbol, visibleRange),
      drawingSelection: projectDrawingSelection(
        this.dependencies.drawings(),
        this.dependencies.selectedDrawingIds(),
        this.dependencies.readPaneRow,
        this.dependencies.formatAnchorTime,
      ),
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
