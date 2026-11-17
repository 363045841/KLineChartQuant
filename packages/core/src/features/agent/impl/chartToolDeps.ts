/**
 * Agent 工具所需的领域能力装配。
 *
 * 三个命令面都只依赖领域对象：指标实例、图元与行情查询。身份分配、落点解析
 * 与快照投影在这里一次完成，工具层只声明合同，不接触 paneId 或实例 id 生成。
 */
import type { TradingDate } from '../../../data/provider/types.js'
import type { DrawingAnchorCommandInput, DrawingObject } from '../../../engine/drawing/index.js'
import { INSTANCE_MOVE_KIND } from '../../../engine/pane/types.js'
import { CHART_AGENT_ERROR_CODES, DRAWING_ERROR_CODES, KLineChartError } from '../../../errors.js'
import type {
  ChartAgentDrawingCommands,
  ChartAgentDrawingCommandsDependencies,
  ChartAgentDrawingCreateInput,
  ChartAgentDrawingPatch,
  ChartAgentDrawingSnapshot,
  ChartAgentIndicatorCommands,
  ChartAgentIndicatorCommandsDependencies,
  ChartAgentIndicatorView,
  ChartAgentMarketQueries,
  ChartAgentMarketQueriesDependencies,
  ChartAgentPlacement,
  ChartAgentToolDeps,
} from '../types.js'

/** 把核心图元投影为不含渲染派生坐标的 Agent 快照。 */
function projectDrawing(
  drawing: DrawingObject,
  placement: ChartAgentPlacement | null,
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

/** 把 Agent 的交易日锚点转换为 Core 绘图命令的声明式输入。 */
function parseAnchors(
  anchors: ChartAgentDrawingCreateInput['anchors'],
): ReadonlyArray<DrawingAnchorCommandInput> {
  return anchors.map(({ tradingDate, price }) =>
    tradingDate === undefined ? { price } : { tradingDate: tradingDate as TradingDate, price },
  )
}

/** 构造指标实例命令面。 */
export function createChartAgentIndicatorCommands(
  deps: ChartAgentIndicatorCommandsDependencies,
): ChartAgentIndicatorCommands {
  const layout = () => deps.panes.getLayoutSpecs()
  const mainPaneId = () => layout()[0]?.id
  const paneIdOf = (instanceId: string): string | undefined =>
    deps.facade.instances.peek().find((instance) => instance.id === instanceId)?.paneId

  return {
    list(): ReadonlyArray<ChartAgentIndicatorView> {
      const rows = layout()
      const rowOf = new Map(rows.map((pane, index) => [pane.id, index]))
      const main = rows[0]?.id
      return deps.facade.instances
        .peek()
        .slice()
        .sort((left, right) => (rowOf.get(left.paneId) ?? 0) - (rowOf.get(right.paneId) ?? 0))
        .map((instance) => {
          const row = rowOf.get(instance.paneId) ?? null
          return {
            instanceId: instance.id,
            definitionId: instance.definitionId,
            params: Object.freeze({ ...instance.params }),
            placement: instance.paneId === main ? 'main' : 'sub',
            row: instance.paneId === main ? null : row,
          }
        })
    },

    add(definitionId, params, placement) {
      const instanceId = deps.facade.add(definitionId, params, placement)
      if (instanceId === null) {
        throw new KLineChartError(
          CHART_AGENT_ERROR_CODES.INDICATOR_NOT_FOUND,
          `Indicator '${definitionId}' is not registered. Use indicators_list to inspect the chart, or load the definition first.`,
        )
      }
      return instanceId
    },

    update(instanceId, patch) {
      const { definitionId, params, placement } = patch
      if (definitionId !== undefined || params !== undefined) {
        const updated = deps.facade.update(instanceId, {
          ...(definitionId === undefined ? {} : { indicatorId: definitionId }),
          ...(params === undefined ? {} : { params }),
        })
        if (!updated) return false
      }
      if (placement !== undefined) return relocate(instanceId, placement)
      return definitionId !== undefined || params !== undefined
    },

    move(instanceId, row) {
      const paneId = paneIdOf(instanceId)
      if (paneId === undefined || paneId === mainPaneId()) return false
      return deps.panes.movePane(paneId, row)
    },

    remove(instanceId) {
      return deps.facade.remove(instanceId)
    },

    clear() {
      const main = mainPaneId()
      const owned = deps.facade.instances.peek().filter((instance) => instance.paneId !== main)
      for (const instance of owned) deps.facade.remove(instance.id)
      return owned.length
    },

    async resolveDefinition(definitionId) {
      await deps.loadIndicators([definitionId])
      const resolved = deps.resolveCanonicalId(definitionId)
      if (!resolved || !deps.isRendererAvailable(resolved)) return null
      return resolved
    },
  }

  /**
   * 把实例搬到指定落点。
   *
   * main 表示主图叠加，sub 表示独占副图；已经在目标落点时是无操作。
   */
  function relocate(instanceId: string, placement: 'main' | 'sub'): boolean {
    const rows = layout()
    const main = rows[0]?.id
    const current = paneIdOf(instanceId)
    if (main === undefined || current === undefined) return false
    const onMain = current === main
    if (placement === 'main') {
      if (onMain) return true
      return deps.facade.move(instanceId, { kind: INSTANCE_MOVE_KIND.PANE, paneId: main })
    }
    if (!onMain) return true
    const anchor = rows[rows.length - 1]!.id
    const paneId = deps.panes.addPane(anchor, 'below')
    if (paneId === null) return false
    if (deps.facade.move(instanceId, { kind: INSTANCE_MOVE_KIND.PANE, paneId })) return true
    deps.panes.removePane(paneId)
    return false
  }
}

/** 构造图元命令面。 */
export function createChartAgentDrawingCommands(
  deps: ChartAgentDrawingCommandsDependencies,
): ChartAgentDrawingCommands {
  const project = (drawing: DrawingObject): ChartAgentDrawingSnapshot =>
    projectDrawing(drawing, deps.readPlacement(drawing.paneId))

  return {
    list() {
      return deps.drawingDocument.listDrawings().map(project)
    },

    create(input) {
      const paneId = deps.resolvePaneId(input.placement)
      if (paneId === null) throw unknownPlacement(input.placement)
      return project(
        deps.drawingCommands.create({
          kind: input.kind as Parameters<typeof deps.drawingCommands.create>[0]['kind'],
          paneId,
          anchors: parseAnchors(input.anchors),
          style: input.style as Parameters<typeof deps.drawingCommands.create>[0]['style'],
          ...(input.labels === undefined ? {} : { labels: input.labels }),
          ...(input.visible === undefined ? {} : { visible: input.visible }),
          ...(input.locked === undefined ? {} : { locked: input.locked }),
          ...(input.zIndex === undefined ? {} : { zIndex: input.zIndex }),
        }),
      )
    },

    update(drawingId, patch: ChartAgentDrawingPatch) {
      const drawing = deps.drawingCommands.updateFromInput(drawingId, {
        ...(patch.anchors === undefined ? {} : { anchors: parseAnchors(patch.anchors) }),
        ...(patch.style === undefined ? {} : { style: patch.style }),
        ...(patch.labels === undefined ? {} : { labels: patch.labels }),
        ...(patch.visible === undefined ? {} : { visible: patch.visible }),
        ...(patch.locked === undefined ? {} : { locked: patch.locked }),
        ...(patch.zIndex === undefined ? {} : { zIndex: patch.zIndex }),
      })
      return drawing ? project(drawing) : null
    },

    remove(drawingId) {
      return deps.drawingCommands.remove(drawingId)
    },

    copy(drawingIds) {
      return deps.copyDrawings(drawingIds).map(project)
    },

    clear() {
      const removed = deps.drawingDocument.listDrawings().length
      deps.drawingCommands.clear()
      return removed
    },
  }
}

/** 构造行情查询面；数据源白名单与错误提示都在这里收口。 */
export function createChartAgentMarketQueries(
  deps: ChartAgentMarketQueriesDependencies,
): ChartAgentMarketQueries {
  /** 校验显式 sourceId，并向 Agent 返回可直接修正下一次调用的可用值。 */
  function requireEnabledSource(sourceId: string | undefined): void {
    if (sourceId === undefined) return
    const available = deps.sources()
    if (available.includes(sourceId)) return
    throw new KLineChartError(
      CHART_AGENT_ERROR_CODES.INVALID_QUERY,
      `Unknown or disabled sourceId '${sourceId}'. Available sourceIds: ${available.join(', ') || 'none'}. Omit sourceId to allow automatic routing across every enabled source.`,
    )
  }

  return {
    listSourceIds: deps.sources,

    async lookupInstrument(input, context) {
      const signal = input.signal ?? context?.signal
      const instruments = await deps.lookup({
        symbol: input.symbol,
        ...(input.sourceIds === undefined ? {} : { sourceIds: input.sourceIds }),
        ...(signal === undefined ? {} : { signal }),
      })
      return deps.formatter.formatInstrumentLookup({
        symbol: input.symbol,
        instruments,
      })
    },

    async bars(input, context) {
      requireEnabledSource(input.sourceId)
      const result = await deps.cache.queryBars({
        sourceId: input.sourceId,
        symbol: input.symbol,
        exchange: input.exchange,
        instrumentType: input.instrumentType,
        period: input.period,
        adjustment: input.adjustment,
        barAggregation: input.barAggregation,
        limit: input.limit,
        signal: context?.signal,
      })
      return deps.formatter.formatBars({
        sourceId: result.sourceId,
        instrument: result.instrument,
        series: result.series,
        olderData: result.series.olderData,
      })
    },

    async timeShare(input, context) {
      requireEnabledSource(input.sourceId)
      if (input.days <= 1) {
        const result = await deps.cache.queryTimeShare({
          sourceId: input.sourceId,
          symbol: input.symbol,
          exchange: input.exchange,
          instrumentType: input.instrumentType,
          tradingDate: input.tradingDate as TradingDate,
          signal: context?.signal,
        })
        return deps.formatter.formatTimeShare({
          sourceId: result.sourceId,
          instrument: result.instrument,
          series: result.series,
        })
      }
      const result = await deps.cache.queryTimeShareRange({
        sourceId: input.sourceId,
        symbol: input.symbol,
        exchange: input.exchange,
        instrumentType: input.instrumentType,
        endTradingDate: input.tradingDate as TradingDate,
        days: input.days,
        signal: context?.signal,
      })
      return deps.formatter.formatTimeShareRange({
        sourceId: result.sourceId,
        instrument: result.instrument,
        range: result.range,
      })
    },

    indicatorValues(input) {
      return deps.indicatorQuery.queryIndicator({
        definitionId: input.definitionId,
        ...(input.params === undefined ? {} : { params: input.params }),
        ...(input.limit === undefined ? {} : { limit: input.limit }),
      })
    },
  }
}

/** 组合三块能力，得到工具层唯一依赖。 */
export function createChartAgentToolDeps(input: {
  readonly indicators: ChartAgentIndicatorCommands
  readonly drawings: ChartAgentDrawingCommands
  readonly comparisons: ChartAgentToolDeps['comparisons']
  readonly market: ChartAgentMarketQueries
}): ChartAgentToolDeps {
  return Object.freeze({
    indicators: input.indicators,
    drawings: input.drawings,
    comparisons: input.comparisons,
    market: input.market,
  })
}

/** 落点无法解析为容器时的可纠正错误。 */
function unknownPlacement(placement: string): KLineChartError {
  return new KLineChartError(
    DRAWING_ERROR_CODES.UNKNOWN_PANE,
    `Unknown placement '${placement}'. Use "main" for the price chart, or an indicator instanceId from indicators_list for its pane.`,
  )
}
