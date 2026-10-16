/**
 * PlotCollector：把逐 bar 的 onPlot 输出汇聚成按 K 线对齐的 PlotCollection。
 *
 * 它把散落的 (name, barIndex, point) 收成每个 Plot 的列：
 * - 声明了 plots 时，只接受已声明的 name，未声明即报错；已声明但无数据的 Plot 补齐空序列。
 * - 未声明 plots 时，允许动态 name，使用调用处类型，缺省为折线。
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
/** 折线默认虚线样式（实线）。 */
const DEFAULT_LINE_DASH: readonly number[] = []
/** 柱状图默认基线。 */
const DEFAULT_HISTOGRAM_BASELINE = 0
/** 填充默认不透明度；同样只有这一处定义。 */
const DEFAULT_FILL_OPACITY = 0.15
/** 字符声明的默认值只在组装时补齐。 */
const DEFAULT_CHAR = '★'

/** 采集器构造参数。 */
export interface PlotCollectorOptions {
  /** 本次运行的 bar 数量，用于补齐空 Plot 的序列长度。 */
  readonly barCount: number
  /** Plot 声明；提供时拒绝未声明 name。 */
  readonly plots?: readonly PlotDeclaration[]
  /** 填充声明。 */
  readonly fills?: readonly PlotFillDeclaration[]
}

/** 按 name / barIndex 汇聚绘图点，最终产出 PlotCollection。 */
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
      if (this.entries.has(declaration.name)) throw new TypeError('Duplicate Plot name')
      this.entries.set(declaration.name, {
        declaration,
        style: styleSignature(declaration),
        data: this.emptyColumn(),
        emitted: false,
      })
    }
  }

  /** 接收绘图点或主动空点；仍校验调用样式，无效数值不会进入输出列。 */
  onPlot(
    name: string,
    barIndex: number,
    point: PlotPoint | null,
    kind?: PlotDeclaration['kind'],
    options?: PlotDeclaration,
  ): void {
    let entry = this.entries.get(name)
    if (this.declared && !entry) {
      throw new Error(
        `[${PLOT_ERROR_CODES.UNDECLARED_PLOT}] plot name '${name}' is not declared in script.plots`,
      )
    }
    if (!entry) {
      entry = this.createEntry(name, kind)
      this.entries.set(name, entry)
    }
    const declaration = withCallOptions(resolveDeclaration(entry.declaration, kind), options)
    // 调用没有改写声明时沿用同一条目，跳过整列样式签名比较。
    if (declaration !== entry.declaration) {
      if (entry.emitted && declaration.kind !== entry.declaration.kind)
        throw new TypeError(`Plot ${name} cannot change kind during a run`)
      const style = styleSignature(declaration)
      if (entry.emitted && !sameStyle(entry.style, style))
        throw new TypeError(`Plot ${name} cannot change style during a run`)
      entry.declaration = declaration
      entry.style = style
    }
    entry.emitted = true
    entry.data[barIndex] = point !== null && Number.isFinite(point.value) ? point : undefined
  }

  /** 产出 PlotCollection：声明优先且保持声明顺序，未声明时按首次出现顺序输出。 */
  collect(): PlotCollection {
    const plots = [...this.entries.values()].map(({ declaration, data }) =>
      createPlot(declaration, data),
    )
    const fills: PlotFill[] = this.fillDeclarations?.map(createFill) ?? []
    validatePlotFills(plots, fills)
    return { plots, fills }
  }

  /** 动态 name 的条目：沿用与声明条目相同的空列结构，样式先留空。 */
  private createEntry(name: string, kind: PlotDeclaration['kind'] | undefined): CollectedPlot {
    return {
      declaration: { name, kind: kind ?? PlotKind.Line },
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
    declaration.name,
    declaration.label,
    declaration.visible,
    declaration.offset,
    declaration.textColor,
    declaration.size,
  ] as const
  switch (declaration.kind) {
    case 'line':
      return [...base, ...(declaration.dash ?? [])]
    case 'histogram':
      return [...base, declaration.baseline]
    case 'points':
      return [...base]
    case 'shape':
      return [...base, declaration.style, declaration.location, declaration.text]
    case 'char':
      return [...base, declaration.char, declaration.location, declaration.text]
    case 'arrow':
      return [...base]
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
type PlotBaseFields = Pick<Plot, 'id' | 'label' | 'data' | 'color' | 'visible' | 'offset' | 'size'>

/** 用声明或默认值补齐 Plot 公共字段；声明用 name，模型的身份字段仍是 id。 */
function plotBase(
  declaration: PlotDeclaration,
  data: readonly (PlotPoint | undefined)[],
): PlotBaseFields {
  return {
    id: declaration.name,
    label: declaration.label ?? declaration.name,
    data,
    color: declaration.color ?? DEFAULT_PLOT_COLOR,
    visible: declaration.visible ?? true,
    offset: declaration.offset ?? 0,
    size: declaration.size ?? ShapeSize.Auto,
  }
}

/** 折线：补虚线默认值。 */
function createLinePlot(declaration: LinePlotDeclaration, base: PlotBaseFields): LinePlot {
  return {
    ...base,
    kind: 'line',
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

/** 散点：几何全部由公共 size 决定。 */
function createPointsPlot(declaration: PointsPlotDeclaration, base: PlotBaseFields): PointsPlot {
  return { ...base, kind: 'points' }
}

/** Shape 与 Char 共享的位置和文字默认值。 */
function markerBase(
  declaration: ShapePlotDeclaration | CharPlotDeclaration,
  base: PlotBaseFields,
): Omit<ShapePlot, 'kind' | 'style'> {
  return {
    ...base,
    location: declaration.location ?? ShapeLocation.AboveBar,
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

/** 箭头：方向颜色缺省时回落到公共颜色；长度由公共 size 决定。 */
function createArrowPlot(declaration: ArrowPlotDeclaration, base: PlotBaseFields): ArrowPlot {
  return {
    ...base,
    kind: 'arrow',
    colorUp: declaration.colorUp ?? base.color,
    colorDown: declaration.colorDown ?? base.color,
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
  const { name, label, color, visible, offset, size } = declaration
  return { name, label, color, visible, offset, size, kind }
}

/** 把填充声明组装成具体 PlotFill；声明用 name，模型的身份字段仍是 id。 */
export function createFill(declaration: PlotFillDeclaration): PlotFill {
  return {
    id: declaration.name,
    from: declaration.from,
    to: declaration.to,
    visible: declaration.visible ?? true,
    color: declaration.color ?? DEFAULT_PLOT_COLOR,
    reverseColor: declaration.reverseColor ?? declaration.color ?? DEFAULT_PLOT_COLOR,
    opacity: declaration.opacity ?? DEFAULT_FILL_OPACITY,
  }
}
