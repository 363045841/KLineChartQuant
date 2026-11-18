/**
 * Agent 工具所需的领域能力装配。
 *
 * 三个命令面都只依赖领域对象：指标实例、图元与行情查询。身份分配、落点解析
 * 与快照投影在这里一次完成，工具层只声明合同，不接触 paneId 或实例 id 生成。
 */
import type { TradingDate } from '../../../data/provider/types.js'
import type {
  DrawingAnchorCommandInput,
  DrawingKind,
  DrawingObject,
} from '../../../engine/drawing/index.js'
import {
  drawingAnchorAxes,
  getDrawingInputAnchorCount,
  isDrawingVisibleInPeriod,
} from '../../../engine/drawing/index.js'
import { INSTANCE_MOVE_KIND, MAIN_PANE_ID } from '../../../engine/pane/types.js'
import { CHART_AGENT_ERROR_CODES, DRAWING_ERROR_CODES, KLineChartError } from '../../../errors.js'
import { ToolInputValidationError } from '../../../foundation/agent/index.js'
import type {
  ChartAgentDrawingAnchor,
  ChartAgentDrawingCommands,
  ChartAgentDrawingCommandsDependencies,
  ChartAgentDrawingPatch,
  ChartAgentDrawingScope,
  ChartAgentDrawingView,
  ChartAgentIndicatorCommands,
  ChartAgentIndicatorCommandsDependencies,
  ChartAgentIndicatorTarget,
  ChartAgentIndicatorView,
  ChartAgentMarketQueries,
  ChartAgentMarketQueriesDependencies,
  ChartAgentToolDeps,
} from '../types.js'
import { describeDrawingAnchorShape } from './drawingAnchorContract.js'
import {
  formatDrawingAnchorTime,
  parseDrawingAnchorTime,
  type DrawingAnchorTimeInput,
} from './drawingAnchorTime.js'
import { projectDrawingSnapshot, toDrawingView } from './drawingSnapshot.js'

/** 构造指标实例命令面。 */
export function createChartAgentIndicatorCommands(
  deps: ChartAgentIndicatorCommandsDependencies,
): ChartAgentIndicatorCommands {
  const layout = () => deps.panes.getLayoutSpecs()

  /**
   * 把当前实例投影成按行、行内顺序排列的视图。
   *
   * 内部实例 ID 只作为 Map 键，不进入视图；不在布局内的实例不会暴露给 Agent。
   */
  function project(): Map<string, { readonly view: ChartAgentIndicatorView; readonly paneId: string }> {
    const rows = layout()
    const rowOf = new Map(rows.map((pane, index) => [pane.id, index]))
    const ordered = deps.facade.instances
      .peek()
      .filter((instance) => rowOf.has(instance.paneId))
      .slice()
      .sort(
        (left, right) =>
          rowOf.get(left.paneId)! - rowOf.get(right.paneId)! || left.ordinal - right.ordinal,
      )
    const counters = new Map<string, number>()
    const projected = new Map<string, { view: ChartAgentIndicatorView; paneId: string }>()
    for (const instance of ordered) {
      const row = rowOf.get(instance.paneId)!
      const order = (counters.get(instance.paneId) ?? 0) + 1
      counters.set(instance.paneId, order)
      projected.set(instance.id, {
        paneId: instance.paneId,
        view: {
          indicator: instance.definitionId,
          params: Object.freeze({ ...instance.params }),
          placement: instance.paneId === MAIN_PANE_ID ? 'main' : 'sub',
          row,
          order,
        },
      })
    }
    return projected
  }

  /** 读取单个实例的视图；写操作后立刻读取，投影缺失视为状态不一致。 */
  function viewOf(instanceId: string): ChartAgentIndicatorView {
    const view = project().get(instanceId)?.view
    if (view === undefined) {
      throw new KLineChartError(
        CHART_AGENT_ERROR_CODES.INSTANCE_NOT_FOUND,
        'The indicator changed before its new position could be read. Call indicators_list and retry.',
      )
    }
    return view
  }

  /** 按名称与位置定位实例；零个或多于一个都返回可纠正错误。 */
  function resolveTarget(target: ChartAgentIndicatorTarget): {
    readonly instanceId: string
    readonly paneId: string
    readonly view: ChartAgentIndicatorView
  } {
    const projected = project()
    const matches = [...projected.entries()].filter(([, entry]) => {
      if (entry.view.indicator !== target.indicator) return false
      if (target.row !== undefined && entry.view.row !== target.row) return false
      if (target.order !== undefined && entry.view.order !== target.order) return false
      return true
    })
    if (matches.length === 1) {
      const [instanceId, entry] = matches[0]!
      return { instanceId, paneId: entry.paneId, view: entry.view }
    }
    if (matches.length === 0) {
      throw new KLineChartError(
        CHART_AGENT_ERROR_CODES.INSTANCE_NOT_FOUND,
        `No indicator matches ${describeTarget(target)}. Current indicators: ${describeProjection(projected)}.`,
      )
    }
    const candidates = matches.map(([, entry]) => describeView(entry.view)).join('; ')
    const rows = new Set(matches.map(([, entry]) => entry.view.row))
    const hint =
      target.row === undefined && rows.size > 1
        ? 'Add row; if several candidates share that row, add order too.'
        : 'Add order.'
    throw new KLineChartError(
      CHART_AGENT_ERROR_CODES.INVALID_QUERY,
      `Indicator '${target.indicator}' matches ${matches.length} instances. ${hint} Candidates: ${candidates}.`,
    )
  }

  return {
    list(): ReadonlyArray<ChartAgentIndicatorView> {
      return [...project().values()].map((entry) => entry.view)
    },

    add(indicator, params, placement) {
      const instanceId = deps.facade.add(indicator, params, placement)
      if (instanceId === null) {
        throw new KLineChartError(
          CHART_AGENT_ERROR_CODES.INDICATOR_NOT_FOUND,
          `Indicator '${indicator}' is not registered. Use indicators_list to read the indicator names already on the chart.`,
        )
      }
      return viewOf(instanceId)
    },

    read(target) {
      return resolveTarget(target).view
    },

    update(target, params) {
      const { instanceId } = resolveTarget(target)
      if (!deps.facade.update(instanceId, { params })) {
        throw new KLineChartError(
          CHART_AGENT_ERROR_CODES.INSTANCE_NOT_FOUND,
          `Indicator ${describeTarget(target)} disappeared before it could be updated. Call indicators_list and retry.`,
        )
      }
      return viewOf(instanceId)
    },

    /** 把实例移动到指定显示行；主图可能不在 0，行号以当前 layout 为准。 */
    move(target, row) {
      const { instanceId, paneId } = resolveTarget(target)
      const rows = layout()
      const destination = rows[row]
      if (destination === undefined) {
        throw new KLineChartError(
          CHART_AGENT_ERROR_CODES.TARGET_ROW_OUT_OF_RANGE,
          `targetRow ${row} is outside the chart layout. Valid rows: 0 through ${rows.length - 1}.`,
        )
      }
      // 已在目标行时不调用移动，避免把实例重排到 pane 末尾。
      if (destination.id === paneId) return viewOf(instanceId)
      if (!deps.facade.move(instanceId, { kind: INSTANCE_MOVE_KIND.PANE, paneId: destination.id })) {
        throw new KLineChartError(
          CHART_AGENT_ERROR_CODES.INVALID_QUERY,
          `Indicator ${describeTarget(target)} could not be moved to row ${row}. Call indicators_list and retry.`,
        )
      }
      return viewOf(instanceId)
    },

    remove(target) {
      const { instanceId, view } = resolveTarget(target)
      if (!deps.facade.remove(instanceId)) {
        throw new KLineChartError(
          CHART_AGENT_ERROR_CODES.INSTANCE_NOT_FOUND,
          `Indicator ${describeTarget(target)} disappeared before it could be removed. Call indicators_list and retry.`,
        )
      }
      return view
    },

    async resolveDefinition(indicator) {
      await deps.loadIndicators([indicator])
      const resolved = deps.resolveCanonicalId(indicator)
      if (!resolved || !deps.isRendererAvailable(resolved)) return null
      const params = deps.readParamDefs(resolved)
      return params === undefined ? null : { indicator: resolved, params }
    },
  }
}

/**
 * 按 kind 的坐标轴把契约锚点转成领域输入。
 *
 * 形状错误在这里一次说清，避免把缺失或多余的轴带进领域层再报一个无关错误。
 */
function toDomainAnchors(
  kind: DrawingKind,
  anchors: ReadonlyArray<ChartAgentDrawingAnchor>,
  time: DrawingAnchorTimeInput,
): ReadonlyArray<DrawingAnchorCommandInput> {
  const axes = drawingAnchorAxes(kind)
  const expected = getDrawingInputAnchorCount(kind)
  const problems: string[] = []
  if (anchors.length !== expected) {
    problems.push(`expected ${expected} anchor${expected > 1 ? 's' : ''}, got ${anchors.length}`)
  }
  anchors.forEach((anchor, index) => {
    if (axes.time && anchor.time === undefined) problems.push(`anchor ${index} needs time`)
    if (!axes.time && anchor.time !== undefined) problems.push(`anchor ${index} must not include time`)
    if (axes.price && anchor.price === undefined) problems.push(`anchor ${index} needs price`)
    if (!axes.price && anchor.price !== undefined)
      problems.push(`anchor ${index} must not include price`)
  })
  if (problems.length > 0) {
    throw new ToolInputValidationError(
      `Invalid anchors for kind '${kind}': it takes ${describeDrawingAnchorShape(kind)}. ${problems.join('; ')}.`,
    )
  }
  return anchors.map((anchor) =>
    axes.time
      ? { timestamp: parseDrawingAnchorTime(anchor.time!, time), price: anchor.price }
      : { price: anchor.price! },
  )
}

/** 越界行错误：给出有效范围，模型可在同一轮修正。 */
function rowOutOfRange(row: number, rowCount: number): KLineChartError {
  const valid = rowCount === 0 ? 'none' : `0 through ${rowCount - 1}`
  return new KLineChartError(
    CHART_AGENT_ERROR_CODES.TARGET_ROW_OUT_OF_RANGE,
    `row ${row} is outside the chart layout. Valid rows: ${valid}.`,
    { details: { row, rowCount } },
  )
}

/** 图元不存在错误：候选与 list 使用同一份投影，不会列出不可见的对象。 */
function drawingNotFound(
  drawingId: string,
  available: ReadonlyArray<ChartAgentDrawingView>,
): KLineChartError {
  const current =
    available.length === 0
      ? 'No drawings are on this symbol.'
      : `Current drawings: ${available
          .map((drawing) => `${drawing.id} (${drawing.kind})`)
          .join('; ')}.`
  return new KLineChartError(
    DRAWING_ERROR_CODES.NOT_FOUND,
    `Unknown drawing '${drawingId}'. ${current} Use the id returned by drawings_list.`,
    { details: { drawingId } },
  )
}

/** 构造图元命令面：窗格用显示行寻址，图元身份由文档分配。 */
export function createChartAgentDrawingCommands(
  deps: ChartAgentDrawingCommandsDependencies,
): ChartAgentDrawingCommands {
  /** 把文档对象投影成带当前周期可见性的视图。 */
  const view = (
    drawing: DrawingObject,
    row: number,
    scope: ChartAgentDrawingScope,
  ): ChartAgentDrawingView =>
    toDrawingView(
      projectDrawingSnapshot(drawing, row, (timestamp) =>
        formatDrawingAnchorTime(timestamp, scope.timezone),
      ),
      isDrawingVisibleInPeriod(drawing.timeframeVisibility, scope.period),
    )

  /** 当前作用域内 Agent 可见的图元：工作区一致且所在行属于布局。 */
  function projectVisible(scope: ChartAgentDrawingScope): ChartAgentDrawingView[] {
    const items: ChartAgentDrawingView[] = []
    for (const drawing of deps.drawingDocument.listCurrentDrawings()) {
      if ((drawing.workspaceId ?? 'kline') !== scope.workspace) continue
      const row = scope.rows.indexOf(drawing.paneId)
      if (row < 0) continue
      items.push(view(drawing, row, scope))
    }
    return items.sort(
      (left, right) => left.row - right.row || (left.zIndex ?? 0) - (right.zIndex ?? 0),
    )
  }

  /** 读取当前工作区内的图元；不在作用域内与不存在按同一种错误处理。 */
  function requireCurrent(
    drawingId: string,
    scope: ChartAgentDrawingScope,
  ): DrawingObject {
    const drawing = deps.drawingDocument.getDrawing(drawingId)
    if (drawing !== null && (drawing.workspaceId ?? 'kline') === scope.workspace) return drawing
    throw drawingNotFound(drawingId, projectVisible(scope))
  }

  return {
    list() {
      const scope = deps.scope()
      return Object.freeze({
        timezone: scope.timezone,
        period: scope.period,
        drawings: Object.freeze(projectVisible(scope)),
      })
    },

    create(input) {
      const scope = deps.scope()
      const paneId = scope.rows[input.row]
      if (paneId === undefined) throw rowOutOfRange(input.row, scope.rows.length)
      const drawing = deps.drawingCommands.create({
        kind: input.kind,
        paneId,
        anchors: toDomainAnchors(input.kind, input.anchors, {
          bars: deps.bars(),
          period: scope.period,
        }),
        style: input.style as Parameters<typeof deps.drawingCommands.create>[0]['style'],
        ...(input.labels === undefined ? {} : { labels: input.labels }),
        ...(input.visible === undefined ? {} : { visible: input.visible }),
        ...(input.locked === undefined ? {} : { locked: input.locked }),
        ...(input.zIndex === undefined ? {} : { zIndex: input.zIndex }),
        ...(input.timeframeVisibility === undefined
          ? {}
          : { timeframeVisibility: input.timeframeVisibility }),
      })
      return view(drawing, input.row, scope)
    },

    update(drawingId: string, patch: ChartAgentDrawingPatch) {
      const scope = deps.scope()
      requireCurrent(drawingId, scope)
      const drawing = deps.drawingCommands.updateFromInput(drawingId, {
        ...(patch.style === undefined ? {} : { style: patch.style }),
        ...(patch.labels === undefined ? {} : { labels: patch.labels }),
        ...(patch.visible === undefined ? {} : { visible: patch.visible }),
        ...(patch.locked === undefined ? {} : { locked: patch.locked }),
        ...(patch.zIndex === undefined ? {} : { zIndex: patch.zIndex }),
        ...(patch.timeframeVisibility === undefined
          ? {}
          : { timeframeVisibility: patch.timeframeVisibility }),
      })
      if (drawing === null) {
        throw new KLineChartError(
          DRAWING_ERROR_CODES.NOT_FOUND,
          `Drawing ${drawingId} disappeared before it could be updated. Call drawings_list and retry.`,
          { details: { drawingId } },
        )
      }
      const row = scope.rows.indexOf(drawing.paneId)
      if (row < 0) throw drawingNotFound(drawingId, projectVisible(scope))
      return view(drawing, row, scope)
    },

    remove(drawingId: string) {
      const scope = deps.scope()
      const current = requireCurrent(drawingId, scope)
      if (!deps.drawingCommands.remove(drawingId)) {
        throw new KLineChartError(
          DRAWING_ERROR_CODES.LOCKED,
          `Drawing ${drawingId} is locked. Update it with locked=false first, then delete it.`,
          { details: { drawingId } },
        )
      }
      const row = scope.rows.indexOf(current.paneId)
      if (row < 0) throw drawingNotFound(drawingId, projectVisible(scope))
      return view(current, row, scope)
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

/** 指标定位的可读描述，用于“找不到”提示。 */
function describeTarget(target: ChartAgentIndicatorTarget): string {
  const parts = [`'${target.indicator}'`]
  if (target.row !== undefined) parts.push(`row ${target.row}`)
  if (target.order !== undefined) parts.push(`order ${target.order}`)
  return parts.join(' ')
}

/** 单个候选的位置与参数，用于歧义提示。 */
function describeView(view: ChartAgentIndicatorView): string {
  return `row ${view.row} order ${view.order} (${JSON.stringify(view.params)})`
}

/** 当前全部指标的紧凑列表，用于“找不到”提示。 */
function describeProjection(
  projected: ReadonlyMap<string, { readonly view: ChartAgentIndicatorView }>,
): string {
  const items = [...projected.values()]
  return items.length === 0
    ? 'none'
    : items.map((entry) => `${entry.view.indicator} at ${describeView(entry.view)}`).join('; ')
}
