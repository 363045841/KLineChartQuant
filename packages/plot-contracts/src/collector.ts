/**
 * PlotCollector：把逐 bar 的 onPlot 输出汇聚成按 K 线对齐的 PlotCollection。
 *
 * 它把散落的 (id, barIndex, point) 收成每个 Plot 的列：
 * - 声明了 plots 时，只接受已声明的 id，未声明即报错；已声明但无数据的 Plot 补齐空序列。
 * - 未声明 plots 时，允许动态 id，使用调用处类型，缺省为折线。
 *
 * onEvent 是引擎输出端口的空实现：组装只消费绘图点，不消费事件。
 */
import type {
  ArrowPlotDeclaration,
  CharPlotDeclaration,
  HistogramPlotDeclaration,
  LinePlotDeclaration,
  PlotDeclaration,
  PlotFillDeclaration,
  PointsPlotDeclaration,
  ShapePlotDeclaration,
} from './declaration.js'
import { PLOT_ERROR_CODES } from './errors.js'
import {
  type ArrowPlot,
  type CharPlot,
  type HistogramPlot,
  type LinePlot,
  type Plot,
  type PlotCollection,
  type PlotFill,
  PlotKind,
  type PlotPoint,
  type PointsPlot,
  type ShapePlot,
  validatePlotFills,
} from './plots.js'
import { ShapeLocation, ShapeSize, ShapeStyle } from './shape.js'

/** Plot 默认颜色。 */
const DEFAULT_PLOT_COLOR = '#2196f3'
/** 折线默认线宽。 */
const DEFAULT_LINE_WIDTH = 1
/** 折线默认虚线样式（实线）。 */
const DEFAULT_LINE_DASH: readonly number[] = []
/** 柱状图默认基线。 */
const DEFAULT_HISTOGRAM_BASELINE = 0
/** 点图默认半径；脚本产出与原生指标共用这一个默认值。 */
const DEFAULT_POINTS_RADIUS = 1.5
/** 填充默认不透明度；同样只有这一处定义。 */
const DEFAULT_FILL_OPACITY = 0.15
/** 字符与箭头的声明默认值只在组装时补齐。 */
const DEFAULT_CHAR = '★'
const DEFAULT_ARROW_MIN_HEIGHT = 5
const DEFAULT_ARROW_MAX_HEIGHT = 50

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
  private readonly declared: boolean
  private readonly fillDeclarations?: readonly PlotFillDeclaration[]
  private readonly entries = new Map<string, CollectedPlot>()

  /** 声明和直接调用都写入同一份有序条目，声明只负责预先创建空列。 */
  constructor(options: PlotCollectorOptions) {
    this.barCount = options.barCount
    this.declared = options.plots !== undefined
    this.fillDeclarations = options.fills
    for (const declaration of options.plots ?? []) {
      if (this.entries.has(declaration.id)) throw new TypeError('Duplicate Plot id')
      this.entries.set(declaration.id, {
        declaration,
        style: styleSignature(declaration),
        data: this.emptyColumn(),
        emitted: false,
      })
    }
  }

  /** 接收绘图点和调用样式；样式整轮固定，颜色随点变化。 */
  onPlot(
    id: string,
    barIndex: number,
    point: PlotPoint,
    kind?: PlotDeclaration['kind'],
    options?: PlotDeclaration,
  ): void {
    let entry = this.entries.get(id)
    if (this.declared && !entry) {
      throw new Error(
        `[${PLOT_ERROR_CODES.UNDECLARED_PLOT}] plot id '${id}' is not declared in script.plots`,
      )
    }
    if (!entry) {
      entry = this.createEntry(id, kind)
      this.entries.set(id, entry)
    }
    const declaration = withCallOptions(resolveDeclaration(entry.declaration, kind), options)
    // 调用没有改写声明时沿用同一条目，跳过整列样式签名比较。
    if (declaration !== entry.declaration) {
      if (entry.emitted && declaration.kind !== entry.declaration.kind)
        throw new TypeError(`Plot ${id} cannot change kind during a run`)
      const style = styleSignature(declaration)
      if (entry.emitted && !sameStyle(entry.style, style))
        throw new TypeError(`Plot ${id} cannot change style during a run`)
      entry.declaration = declaration
      entry.style = style
    }
    entry.emitted = true
    entry.data[barIndex] = point
  }

  /** 事件不参与 PlotCollection；参数放宽以匹配引擎 OutputSink 的结构。 */
  onEvent(_event: unknown): void {}

  /** 产出 PlotCollection：声明优先且保持声明顺序，未声明时按首次出现顺序输出。 */
  collect(): PlotCollection {
    const plots = [...this.entries.values()].map(({ declaration, data }) =>
      createPlot(declaration, data),
    )
    const fills: PlotFill[] = this.fillDeclarations?.map(createFill) ?? []
    validatePlotFills(plots, fills)
    return { plots, fills }
  }

  /** 动态 id 的条目：沿用与声明条目相同的空列结构，样式先留空。 */
  private createEntry(id: string, kind: PlotDeclaration['kind'] | undefined): CollectedPlot {
    return {
      declaration: { id, kind: kind ?? PlotKind.Line },
      style: [],
      data: this.emptyColumn(),
      emitted: false,
    }
  }

  /** 构造与本次运行 bar 数等长的稠密空序列。 */
  private emptyColumn(): (PlotPoint | undefined)[] {
    return new Array<PlotPoint | undefined>(this.barCount).fill(undefined)
  }
}

/** 同一个 Plot 的声明、整列样式签名和数值列只保留一份。 */
interface CollectedPlot {
  declaration: PlotDeclaration
  style: readonly (string | number | boolean | undefined)[]
  readonly data: (PlotPoint | undefined)[]
  emitted: boolean
}

/**
 * 整列样式签名：逐 bar 输出必须与首次一致，颜色不参与（逐点颜色由 PlotPoint 携带）。
 * 虚线展开为元素，避免调用处每根 bar 新建数组造成假变更。
 */
function styleSignature(
  declaration: PlotDeclaration,
): readonly (string | number | boolean | undefined)[] {
  const base = [
    declaration.id,
    declaration.label,
    declaration.visible,
    declaration.offset,
    declaration.textColor,
  ] as const
  switch (declaration.kind) {
    case 'line':
      return [...base, declaration.width, ...(declaration.dash ?? [])]
    case 'histogram':
      return [...base, declaration.baseline]
    case 'points':
      return [...base, declaration.radius]
    case 'shape':
      return [...base, declaration.style, declaration.location, declaration.size, declaration.text]
    case 'char':
      return [...base, declaration.char, declaration.location, declaration.size, declaration.text]
    case 'arrow':
      return [...base, declaration.minHeight, declaration.maxHeight]
  }
}

/** 按元素比较两个整列样式签名。 */
function sameStyle(previous: readonly unknown[], next: readonly unknown[]): boolean {
  return previous.length === next.length && previous.every((entry, index) => entry === next[index])
}

/** 调用样式覆盖声明；逐 bar 颜色由 PlotPoint 携带，不改变整列样式。 */
function withCallOptions(declaration: PlotDeclaration, options?: PlotDeclaration): PlotDeclaration {
  if (!options) return declaration
  const { color: _color, textColor: _textColor, ...style } = options
  return { ...declaration, ...style }
}

/** Plot 的公共字段，各 kind 的组装函数共用同一份基础。 */
type PlotBaseFields = Pick<Plot, 'id' | 'label' | 'data' | 'color' | 'visible' | 'offset'>

/** 用声明或默认值补齐 Plot 公共字段。 */
function plotBase(
  declaration: PlotDeclaration,
  data: readonly (PlotPoint | undefined)[],
): PlotBaseFields {
  return {
    id: declaration.id,
    label: declaration.label ?? declaration.id,
    data,
    color: declaration.color ?? DEFAULT_PLOT_COLOR,
    visible: declaration.visible ?? true,
    offset: declaration.offset ?? 0,
  }
}

/** 折线：补线宽与虚线默认值。 */
function createLinePlot(declaration: LinePlotDeclaration, base: PlotBaseFields): LinePlot {
  return {
    ...base,
    kind: 'line',
    width: declaration.width ?? DEFAULT_LINE_WIDTH,
    dash: declaration.dash ?? DEFAULT_LINE_DASH,
  }
}

/** 柱状图：补基线默认值。 */
function createHistogramPlot(
  declaration: HistogramPlotDeclaration,
  base: PlotBaseFields,
): HistogramPlot {
  return {
    ...base,
    kind: 'histogram',
    baseline: declaration.baseline ?? DEFAULT_HISTOGRAM_BASELINE,
  }
}

/** 散点：补半径默认值。 */
function createPointsPlot(declaration: PointsPlotDeclaration, base: PlotBaseFields): PointsPlot {
  return { ...base, kind: 'points', radius: declaration.radius ?? DEFAULT_POINTS_RADIUS }
}

/** Shape 与 Char 共享的位置、尺寸和文字默认值。 */
function markerBase(
  declaration: ShapePlotDeclaration | CharPlotDeclaration,
  base: PlotBaseFields,
): Omit<ShapePlot, 'kind' | 'style'> {
  return {
    ...base,
    location: declaration.location ?? ShapeLocation.AboveBar,
    size: declaration.size ?? ShapeSize.Auto,
    text: declaration.text ?? '',
    textColor: declaration.textColor ?? base.color,
  }
}

/** 固定形状：补形状枚举默认值。 */
function createShapePlot(declaration: ShapePlotDeclaration, base: PlotBaseFields): ShapePlot {
  return {
    ...markerBase(declaration, base),
    kind: 'shape',
    style: declaration.style ?? ShapeStyle.XCross,
  }
}

/** 字符标记：空字符合法，只显示附加文字；多码点直接拒绝。 */
function createCharPlot(declaration: CharPlotDeclaration, base: PlotBaseFields): CharPlot {
  const char = declaration.char ?? DEFAULT_CHAR
  if (Array.from(char).length > 1)
    throw new TypeError('Char Plot requires a single Unicode character')
  return { ...markerBase(declaration, base), kind: 'char', char }
}

/** 箭头：高度范围必须有效，方向颜色缺省时回落到公共颜色。 */
function createArrowPlot(declaration: ArrowPlotDeclaration, base: PlotBaseFields): ArrowPlot {
  const minHeight = declaration.minHeight ?? DEFAULT_ARROW_MIN_HEIGHT
  const maxHeight = declaration.maxHeight ?? DEFAULT_ARROW_MAX_HEIGHT
  if (
    !Number.isFinite(minHeight) ||
    !Number.isFinite(maxHeight) ||
    minHeight <= 0 ||
    maxHeight < minHeight
  )
    throw new TypeError('Arrow Plot requires 0 < minHeight <= maxHeight')
  return {
    ...base,
    kind: 'arrow',
    colorUp: declaration.colorUp ?? base.color,
    colorDown: declaration.colorDown ?? base.color,
    minHeight,
    maxHeight,
  }
}

/** 把 Plot 声明与采集到的数据组装成具体 Plot，只负责按 kind 分派。 */
export function createPlot(
  declaration: PlotDeclaration,
  data: readonly (PlotPoint | undefined)[],
): Plot {
  const base = plotBase(declaration, data)
  switch (declaration.kind) {
    case 'line':
      return createLinePlot(declaration, base)
    case 'histogram':
      return createHistogramPlot(declaration, base)
    case 'points':
      return createPointsPlot(declaration, base)
    case 'shape':
      return createShapePlot(declaration, base)
    case 'char':
      return createCharPlot(declaration, base)
    case 'arrow':
      return createArrowPlot(declaration, base)
  }
}

/** 调用覆盖 kind 时只保留公共声明；专属字段始终来自实际 kind 的声明。 */
function resolveDeclaration(
  declaration: PlotDeclaration,
  kind = declaration.kind,
): PlotDeclaration {
  if (kind === declaration.kind) return declaration
  const { id, label, color, visible, offset } = declaration
  return { id, label, color, visible, offset, kind }
}

/** 把填充声明组装成具体 PlotFill，缺省字段填入默认值。 */
export function createFill(declaration: PlotFillDeclaration): PlotFill {
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
