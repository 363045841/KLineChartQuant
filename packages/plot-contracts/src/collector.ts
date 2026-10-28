/**
 * PlotCollector：把逐 bar 的 onPlot / onFill 输出汇聚成按 K 线对齐的 PlotCollection。
 *
 * 它把散落的 (name, barIndex, point) 收成每个 Plot 的列：
 * Plot 按首次出现的 name 建立条目，类型取调用处，缺省为折线；
 * 填充按名称登记边界，颜色写入对应 bar 的序列。
 */
import { Color } from './color.js'
import type {
  ArrowPlotDeclaration,
  CharPlotDeclaration,
  ColumnsPlotDeclaration,
  HistogramPlotDeclaration,
  LineBRPlotDeclaration,
  LinePlotDeclaration,
  OhlcPlotDeclaration,
  ScalarPlotDeclaration as PlotDeclaration,
  PlotFillDeclaration,
  PointsPlotDeclaration,
  ShapePlotDeclaration,
  StepLineBRPlotDeclaration,
  StepLinePlotDeclaration,
} from './declaration.js'
import type { HLine, HLineFill } from './hline.js'
import {
  type ArrowPlot,
  type CharPlot,
  type ColumnsPlot,
  type HistogramPlot,
  type LineBRPlot,
  type LinePlot,
  type OhlcPlot,
  type OhlcPlotPoint,
  type Plot,
  type PlotCollection,
  type PlotFill,
  PlotKind,
  type PlotPoint,
  type PointsPlot,
  type ScalarPlot,
  type ShapePlot,
  type StepLineBRPlot,
  type StepLinePlot,
  validatePlotFills,
} from './plots.js'
import { ShapeLocation, ShapeSize, ShapeStyle } from './shape.js'

/** Plot 默认颜色：跟随主题的蓝，脚本不写颜色时由宿主解析成当前主题色值。 */
export const DEFAULT_PLOT_COLOR: Color = Color.Blue
/** 折线默认虚线样式（实线）。 */
const DEFAULT_LINE_DASH: readonly number[] = []
/** 柱状图默认基线。 */
const DEFAULT_HISTOGRAM_BASELINE = 0
/** 字符声明的默认值只在组装时补齐。 */
const DEFAULT_CHAR = '★'

/** 采集器构造参数。 */
export interface PlotCollectorOptions {
  /** 本次运行的 bar 数量，用于补齐空 Plot 的序列长度。 */
  readonly barCount: number
}

/** 按 name / barIndex 汇聚绘图点，最终产出 PlotCollection。 */
export class PlotCollector {
  private readonly barCount: number
  private readonly fills = new Map<string, CollectedFill>()
  private readonly entries = new Map<string, CollectedPlot | CollectedOhlcPlot>()
  private readonly hlines: HLine[] = []
  private readonly hlineFills: HLineFill[] = []

  /** 登记 bar 数量；Plot 条目在首次输出时按 name 建立，填充由 onFill 登记。 */
  constructor(options: PlotCollectorOptions) {
    this.barCount = options.barCount
  }

  /** 按名称采集当前 bar 的填充颜色；边界和整列显隐在一次运行内固定。 */
  onFill(declaration: PlotFillDeclaration, barIndex: number): void {
    const { color, ...metadata } = declaration
    let entry = this.fills.get(declaration.name)
    if (!entry) {
      entry = { declaration: metadata, colors: new Array<string | null>(this.barCount).fill(null) }
      this.fills.set(declaration.name, entry)
    }
    const previous = entry.declaration
    if (
      previous.from !== declaration.from ||
      previous.to !== declaration.to ||
      (previous.visible !== false) !== (declaration.visible !== false)
    )
      throw new TypeError(
        `Fill ${declaration.name} cannot change boundaries or visibility during a run`,
      )
    entry.colors[barIndex] = color
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
    if (entry?.source === 'ohlc')
      throw new TypeError(`Plot ${name} cannot change kind during a run`)
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

  /** 登记图表级水平线并返回本轮运行内的句柄 id；hline 只在文件顶层声明。 */
  onHLine(line: Omit<HLine, 'id'>): string {
    const id = String(this.hlines.length)
    this.hlines.push({ ...line, id })
    return id
  }

  /**
   * 登记两条水平线之间的整幅填充。
   * id 缺省按 from/to 生成；颜色为 null 表示显式不绘制。
   */
  onHLineFill(
    from: string,
    to: string,
    color: string | null,
    title: string | undefined,
    visible: boolean,
  ): void {
    const ids = new Set(this.hlines.map((line) => line.id))
    if (!ids.has(from) || !ids.has(to))
      throw new TypeError(`Unknown hline fill source: ${title ?? `${from}-${to}`}`)
    if (color === null) return
    this.hlineFills.push({ id: title ?? `${from}-${to}`, from, to, color, visible })
  }

  /** 产出 PlotCollection：Plot 按首次出现顺序输出，再补齐填充。 */
  collect(): PlotCollection {
    const plots = [...this.entries.values()].map(
      (entry): Plot =>
        entry.source === 'ohlc'
          ? createOhlcPlot(entry.declaration, entry.data)
          : createPlot(entry.declaration, entry.data),
    )
    const fills = [...this.fills.values()].map(({ declaration, colors }) =>
      createFill(declaration, colors),
    )
    validatePlotFills(plots, fills)
    return { plots, fills, hlines: this.hlines, hlineFills: this.hlineFills }
  }

  /** 采集完整 OHLC；颜色写入逐点数据，整列元数据在一次运行内固定。 */
  onOhlc(
    declaration: OhlcPlotDeclaration,
    barIndex: number,
    point: OhlcPlotPoint | undefined,
  ): void {
    const { name, kind, label, visible, offset, showLast } = declaration
    let entry = this.entries.get(name)
    if (entry?.source === 'scalar')
      throw new TypeError(`Plot ${name} cannot change kind during a run`)
    const style = [kind, label, visible, offset, showLast, declaration.format]
    if (!entry) {
      entry = {
        source: 'ohlc',
        declaration,
        style,
        data: new Array<OhlcPlotPoint | undefined>(this.barCount).fill(undefined),
      }
      this.entries.set(name, entry)
    } else if (!sameStyle(entry.style, style)) {
      throw new TypeError(`Plot ${name} cannot change style during a run`)
    }
    entry.data[barIndex] = point
  }

  /** 首次出现的 name 建立条目：空列 + 调用类型，样式先留空。 */
  private createEntry(name: string, kind: PlotDeclaration['kind'] | undefined): CollectedPlot {
    return {
      source: 'scalar',
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

/** 填充的固定元数据与逐 bar 颜色分别保存。 */
interface CollectedFill {
  readonly declaration: Omit<PlotFillDeclaration, 'color'>
  readonly colors: (string | null)[]
}

/** 同一个 Plot 的声明、整列样式签名和数值列只保留一份。 */
interface CollectedPlot {
  readonly source: 'scalar'
  declaration: PlotDeclaration
  style: readonly (string | number | boolean | undefined)[]
  readonly data: (PlotPoint | undefined)[]
  emitted: boolean
}

/** OHLC 列单独保存四个价格，不借用单值 PlotPoint。 */
interface CollectedOhlcPlot {
  readonly source: 'ohlc'
  readonly declaration: OhlcPlotDeclaration
  readonly style: readonly unknown[]
  readonly data: (OhlcPlotPoint | undefined)[]
}

/** 补齐 OHLC 整列元数据；颜色在逐 bar 点上独立解析。 */
function createOhlcPlot(
  declaration: OhlcPlotDeclaration,
  data: readonly (OhlcPlotPoint | undefined)[],
): OhlcPlot {
  return {
    id: declaration.name,
    label: declaration.label ?? declaration.name,
    kind: declaration.kind,
    visible: declaration.visible ?? true,
    offset: declaration.offset ?? 0,
    showLast: declaration.showLast,
    color: DEFAULT_PLOT_COLOR,
    format: declaration.format,
    data,
  }
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
    declaration.format,
    declaration.visible,
    declaration.offset,
    declaration.textColor,
    declaration.size,
  ] as const
  switch (declaration.kind) {
    case 'line':
    case 'linebr':
    case 'stepline':
    case 'steplinebr':
      return [...base, ...(declaration.dash ?? [])]
    case 'histogram':
    case 'columns':
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
  return { ...declaration, ...style } as PlotDeclaration
}

/** Plot 的公共字段，各 kind 的组装函数共用同一份基础。 */
type PlotBaseFields = Pick<
  LinePlot,
  'id' | 'label' | 'data' | 'color' | 'format' | 'visible' | 'offset' | 'size'
>

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
    format: declaration.format,
    visible: declaration.visible ?? true,
    offset: declaration.offset ?? 0,
    size:
      typeof declaration.size === 'number' ? ShapeSize.Auto : (declaration.size ?? ShapeSize.Auto),
  }
}

/** 折线与阶梯线共用组装逻辑，kind 保留形状和空值语义。 */
function createLinePlot(
  declaration:
    | LinePlotDeclaration
    | LineBRPlotDeclaration
    | StepLinePlotDeclaration
    | StepLineBRPlotDeclaration,
  base: PlotBaseFields,
): LinePlot | LineBRPlot | StepLinePlot | StepLineBRPlot {
  return {
    ...base,
    kind: declaration.kind,
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
    size: declaration.size ?? ShapeSize.Auto,
    baseline: declaration.baseline ?? DEFAULT_HISTOGRAM_BASELINE,
  }
}

/** 自动柱宽只依赖 K 线间距。 */
function createColumnsPlot(declaration: ColumnsPlotDeclaration, base: PlotBaseFields): ColumnsPlot {
  return {
    ...base,
    kind: 'columns',
    size: ShapeSize.Auto,
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
): ScalarPlot {
  const base = plotBase(declaration, data)
  switch (declaration.kind) {
    case 'line':
    case 'linebr':
    case 'stepline':
    case 'steplinebr':
      return createLinePlot(declaration, base)
    case 'histogram':
      return createHistogramPlot(declaration, base)
    case 'columns':
      return createColumnsPlot(declaration, base)
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
  const { name, label, color, visible, offset, size, format } = declaration
  const common = { name, label, color, visible, offset, format }
  if (kind === 'columns') return { ...common, kind }
  if (kind === 'histogram') return { ...common, size, kind }
  return { ...common, size: typeof size === 'number' ? undefined : size, kind } as PlotDeclaration
}

/** 把填充声明组装成具体 PlotFill；声明用 name，模型的身份字段仍是 id。 */
export function createFill(
  declaration: Omit<PlotFillDeclaration, 'color'>,
  colors: readonly (string | null)[],
): PlotFill {
  return {
    id: declaration.name,
    from: declaration.from,
    to: declaration.to,
    visible: declaration.visible !== false,
    colors,
  }
}
