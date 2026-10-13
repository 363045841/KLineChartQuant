/**
 * PlotCollector：把逐 bar 的 onPlot 输出汇聚成按 K 线对齐的 PlotCollection。
 *
 * 它把散落的 (id, barIndex, point) 收成每个 Plot 的列：
 * - 声明了 plots 时，只接受已声明的 id，未声明即报错；已声明但无数据的 Plot 补齐空序列。
 * - 未声明 plots 时，允许动态 id，使用调用处类型，缺省为折线。
 *
 * onEvent 是引擎输出端口的空实现：组装只消费绘图点，不消费事件。
 */
import type { PlotDeclaration, PlotFillDeclaration } from './declaration.js'
import { PLOT_ERROR_CODES } from './errors.js'
import type { Plot, PlotCollection, PlotFill, PlotPoint } from './plots.js'

/** Plot 默认颜色。 */
const DEFAULT_PLOT_COLOR = '#2196f3'
/** 折线默认线宽。 */
const DEFAULT_LINE_WIDTH = 1
/** 折线默认虚线样式（实线）。 */
const DEFAULT_LINE_DASH: readonly number[] = []
/** 柱状图默认基线。 */
const DEFAULT_HISTOGRAM_BASELINE = 0
/** 点图默认半径。 */
const DEFAULT_POINTS_RADIUS = 3
/** 填充默认不透明度。 */
const DEFAULT_FILL_OPACITY = 0.2

/** 采集器构造参数。 */
export interface PlotCollectorOptions {
  /** 本次运行的 bar 数量，用于补齐空 Plot 的序列长度。 */
  readonly barCount: number
  /** Plot 声明；提供时拒绝未声明 id。 */
  readonly plots?: readonly PlotDeclaration[]
  /** 填充声明。 */
  readonly fills?: readonly PlotFillDeclaration[]
}

/** 按 id / barIndex 汇聚绘图点，最终产出 PlotCollection。 */
export class PlotCollector {
  private readonly barCount: number
  private readonly declarations?: readonly PlotDeclaration[]
  private readonly declaredIds?: ReadonlySet<string>
  private readonly fillDeclarations?: readonly PlotFillDeclaration[]
  private readonly columns = new Map<string, (PlotPoint | undefined)[]>()
  private readonly kinds = new Map<string, PlotDeclaration['kind']>()

  constructor(options: PlotCollectorOptions) {
    this.barCount = options.barCount
    this.declarations = options.plots
    this.declaredIds = options.plots && new Set(options.plots.map((plot) => plot.id))
    this.fillDeclarations = options.fills
    if (this.declaredIds && this.declaredIds.size !== options.plots?.length)
      throw new TypeError('Duplicate Plot id')
  }

  /** 接收绘图点：校验声明（如有）后写入对应 id 的列。 */
  onPlot(id: string, barIndex: number, point: PlotPoint, kind?: PlotDeclaration['kind']): void {
    if (this.declaredIds && !this.declaredIds.has(id)) {
      throw new Error(
        `[${PLOT_ERROR_CODES.UNDECLARED_PLOT}] plot id '${id}' is not declared in script.plots`,
      )
    }
    if (kind !== undefined) {
      const previous = this.kinds.get(id)
      if (previous !== undefined && previous !== kind)
        throw new TypeError(`Plot ${id} cannot change kind during a run`)
      this.kinds.set(id, kind)
    }
    let column = this.columns.get(id)
    if (!column) {
      column = this.emptyColumn()
      this.columns.set(id, column)
    }
    column[barIndex] = point
  }

  /** 事件不参与 PlotCollection；参数放宽以匹配引擎 OutputSink 的结构。 */
  onEvent(_event: unknown): void {}

  /** 产出 PlotCollection：声明优先且保持声明顺序，未声明时按首次出现顺序输出。 */
  collect(): PlotCollection {
    const plots: Plot[] =
      this.declarations?.map((declaration) =>
        toPlot(
          declaration,
          this.columns.get(declaration.id) ?? this.emptyColumn(),
          this.kinds.get(declaration.id),
        ),
      ) ??
      [...this.columns].map(([id, column]) =>
        toPlot({ id, kind: this.kinds.get(id) ?? 'line' }, column),
      )
    const fills: PlotFill[] = this.fillDeclarations?.map(toFill) ?? []
    const ids = new Set(plots.map((plot) => plot.id))
    for (const fill of fills) {
      if (!ids.has(fill.from) || !ids.has(fill.to))
        throw new TypeError(`Unknown fill source: ${fill.id}`)
    }
    return { plots, fills }
  }

  /** 构造与本次运行 bar 数等长的稠密空序列。 */
  private emptyColumn(): (PlotPoint | undefined)[] {
    return new Array<PlotPoint | undefined>(this.barCount).fill(undefined)
  }
}

/** 把 Plot 声明与采集到的数据组装成具体 Plot，缺省字段填入默认值。 */
function toPlot(
  declaration: PlotDeclaration,
  data: readonly (PlotPoint | undefined)[],
  kind = declaration.kind,
): Plot {
  const base = {
    id: declaration.id,
    label: declaration.label ?? declaration.id,
    data,
    color: declaration.color ?? DEFAULT_PLOT_COLOR,
    visible: declaration.visible ?? true,
    offset: declaration.offset ?? 0,
  }
  switch (kind) {
    case 'line':
      return {
        ...base,
        kind: 'line',
        width:
          declaration.kind === 'line'
            ? (declaration.width ?? DEFAULT_LINE_WIDTH)
            : DEFAULT_LINE_WIDTH,
        dash:
          declaration.kind === 'line' ? (declaration.dash ?? DEFAULT_LINE_DASH) : DEFAULT_LINE_DASH,
      }
    case 'histogram':
      return {
        ...base,
        kind: 'histogram',
        baseline:
          declaration.kind === 'histogram'
            ? (declaration.baseline ?? DEFAULT_HISTOGRAM_BASELINE)
            : DEFAULT_HISTOGRAM_BASELINE,
      }
    case 'points':
      return {
        ...base,
        kind: 'points',
        radius:
          declaration.kind === 'points'
            ? (declaration.radius ?? DEFAULT_POINTS_RADIUS)
            : DEFAULT_POINTS_RADIUS,
      }
  }
}

/** 把填充声明组装成具体 PlotFill，缺省字段填入默认值。 */
function toFill(declaration: PlotFillDeclaration): PlotFill {
  return {
    id: declaration.id,
    from: declaration.from,
    to: declaration.to,
    visible: declaration.visible ?? true,
    color: declaration.color ?? DEFAULT_PLOT_COLOR,
    reverseColor: declaration.reverseColor ?? declaration.color ?? DEFAULT_PLOT_COLOR,
    opacity: declaration.opacity ?? DEFAULT_FILL_OPACITY,
  }
}
