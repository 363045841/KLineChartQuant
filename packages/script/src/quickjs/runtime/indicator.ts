/** VM 内指标 SDK：声明入口、参数默认值与逐 bar 输出。 */

/** 单值绘图方法名；OHLC 方法不参与种类映射。 */
type ScalarPlotMethod = Exclude<keyof ScriptPlot, 'Candle' | 'Bar'>

/** 绘图方法的种类与值语义；booleanValue 表示该方法接受布尔条件。 */
interface PlotMethodSpec {
  readonly kind: PlotKind
  readonly booleanValue?: boolean
}

/** 方法表是绘图门面与值校验的唯一来源：新增图形只需在这里登记一次。 */
const PLOT_METHOD_SPECS = {
  Line: { kind: PlotKind.Line },
  LineBR: { kind: PlotKind.LineBR },
  StepLine: { kind: PlotKind.StepLine },
  StepLineBR: { kind: PlotKind.StepLineBR },
  Histogram: { kind: PlotKind.Histogram },
  Columns: { kind: PlotKind.Columns },
  Point: { kind: PlotKind.Points },
  Shape: { kind: PlotKind.Shape, booleanValue: true },
  Char: { kind: PlotKind.Char, booleanValue: true },
  Arrow: { kind: PlotKind.Arrow },
} satisfies Record<ScalarPlotMethod, PlotMethodSpec>

/** 单值绘图方法共用同一实现，只绑定自己的种类与值语义。 */
function scalarPlotMethod(spec: PlotMethodSpec) {
  return (value: number | boolean | null, name: string, options?: ScriptPlotOptions): PlotRef =>
    emitPlot(spec, value, name, options)
}

/** 按方法类型输出当前 K 线；name 标识整列，单值方法返回句柄，OHLC 方法与参考线返回 void 或句柄列表。 */
const plot: ScriptPlot = {
  Line: scalarPlotMethod(PLOT_METHOD_SPECS.Line),
  LineBR: scalarPlotMethod(PLOT_METHOD_SPECS.LineBR),
  StepLine: scalarPlotMethod(PLOT_METHOD_SPECS.StepLine),
  StepLineBR: scalarPlotMethod(PLOT_METHOD_SPECS.StepLineBR),
  Histogram: scalarPlotMethod(PLOT_METHOD_SPECS.Histogram),
  Columns: scalarPlotMethod(PLOT_METHOD_SPECS.Columns),
  Point: scalarPlotMethod(PLOT_METHOD_SPECS.Point),
  Shape: scalarPlotMethod(PLOT_METHOD_SPECS.Shape),
  Char: scalarPlotMethod(PLOT_METHOD_SPECS.Char),
  Arrow: scalarPlotMethod(PLOT_METHOD_SPECS.Arrow),
  /** 输出完整蜡烛 OHLC，统一交给宿主校验、归一化和采集。 */
  Candle(open, high, low, close, name, options) {
    emitOhlcPlot(PlotKind.Candle, open, high, low, close, name, options)
  },
  /** 输出完整美国线 OHLC，与蜡烛共用数据语义。 */
  Bar(open, high, low, close, name, options) {
    emitOhlcPlot(PlotKind.Bar, open, high, low, close, name, options)
  },
}

/** 校验绘图名称与绘图值并传给宿主；null 留空，布尔标记收敛成数值，返回绘图句柄。 */
function emitPlot(
  spec: PlotMethodSpec,
  value: number | boolean | null,
  name: string,
  options?: ScriptPlotOptions,
): PlotRef {
  if (typeof name !== 'string' || name.length === 0) throw new TypeError('plot 需要非空的 name')
  if (
    value !== null &&
    typeof value !== 'number' &&
    !(spec.booleanValue && typeof value === 'boolean')
  )
    throw new TypeError('plot value 需要数值或 null，shape 和 char 也可以使用布尔条件')
  // kind 由宿主按共享契约校验，这里只负责把 JS 值收敛成数值列。
  __plot(spec.kind, toPlotValue(value), name, options)
  return { name }
}

/** OHLC 方法共用入口：四价格整体交给宿主校验与采集。 */
function emitOhlcPlot(
  kind: PlotKind,
  open: number | null,
  high: number | null,
  low: number | null,
  close: number | null,
  name: string,
  options?: CandlePlotOptions,
): void {
  __plot(kind, { open, high, low, close }, name, options)
}

/** 输出当前 bar 的填充颜色；两条 Plot 或两条水平线之间，null 留空。 */
function fill(
  from: PlotRef | HLineRef,
  to: PlotRef | HLineRef,
  color: ScriptColor | (string & {}) | null,
  title?: string,
  options?: ScriptFillOptions,
): void {
  __fill(from, to, color, title, options)
}

/**
 * 图表级水平参考线：固定价格、贯穿整幅宽度，不占用逐 bar 数据列。
 * 只能在文件顶层声明；样式在整轮运行内固定，颜色与线宽不随 bar 变化。
 * @param price 水平线价格
 * @param options 标题、颜色、线型与线宽
 * @returns 句柄；可交给 fill 与另一条水平线围出带状区域
 */
function hline(price: number, options?: HLineOptions): HLineRef {
  return { hline: __hline(price, options) }
}

/** 布尔条件成立记 1，否则主动留空；数值和 null 原样跨越 VM 边界。 */
function toPlotValue(value: number | boolean | null): number | null {
  if (typeof value !== 'boolean') return value
  return value ? 1 : null
}

/** 按类型提供输入工厂，非法默认值和选项在声明时拒绝。 */
const inputFactories = {
  /** 创建整数输入。 */
  int(value: number, options?: NumberInputOptions) {
    if (
      ![value, options?.min, options?.max, options?.step].every(
        (item) => item === undefined || Number.isInteger(item),
      )
    )
      throw new TypeError('input.int 的默认值、范围和步长必须是整数')
    return numberInput(value, { step: 1, ...options })
  },
  /** 创建浮点数输入。 */
  float(value: number, options?: NumberInputOptions) {
    return numberInput(value, options)
  },
  /** 创建布尔输入。 */
  bool(value: boolean, options?: InputOptions) {
    if (typeof value !== 'boolean') throw new TypeError('input.bool 需要布尔默认值')
    return { ...options, default: value }
  },
  /** 创建字符串输入。 */
  string(value: string, options?: StringInputOptions) {
    if (typeof value !== 'string') throw new TypeError('input.string 需要字符串默认值')
    requireOptionList(
      options?.options,
      (item) => typeof item === 'string',
      value,
      'input.string 的 options 必须是包含默认值的非空字符串列表',
    )
    return { ...options, default: value }
  },
  /** 创建目标周期输入；默认值和选项都必须是 Timeframe 中登记的周期。 */
  timeframe(value: Timeframe, options?: TimeframeInputOptions) {
    const periods: readonly string[] = Object.values(Timeframe)
    if (!periods.includes(value)) throw new TypeError('input.timeframe 需要 Timeframe 中登记的周期')
    requireOptionList(
      options?.options,
      (item) => typeof item === 'string' && periods.includes(item),
      value,
      'input.timeframe 的 options 必须是包含默认值的周期列表',
    )
    return { ...options, default: value }
  },
}

/** 下拉选项必须非空、逐项合法且包含默认值；未声明选项时不校验。 */
function requireOptionList(
  options: readonly unknown[] | undefined,
  isValid: (item: unknown) => boolean,
  value: unknown,
  message: string,
): void {
  if (options === undefined) return
  if (!options.length || !options.every(isValid) || !options.includes(value))
    throw new TypeError(message)
}

/** 数值输入的校验规则；任意一条失败即拒绝，提示统一在 numberInput 给出。 */
const NUMBER_INPUT_RULES: readonly ((
  value: number,
  options: NumberInputOptions | undefined,
) => boolean)[] = [
  (value) => Number.isFinite(value),
  (_value, options) =>
    [options?.min, options?.max, options?.step].every(
      (item) => item === undefined || Number.isFinite(item),
    ),
  (_value, options) => options?.step === undefined || options.step > 0,
  (value, options) => options?.min === undefined || value >= options.min,
  (value, options) => options?.max === undefined || value <= options.max,
]

/** 校验数值默认值、边界和步长，声明由宿主传给参数面板。 */
function numberInput(value: number, options?: NumberInputOptions): InputDef<number> {
  if (!NUMBER_INPUT_RULES.every((rule) => rule(value, options)))
    throw new TypeError('数值输入需要有限默认值、有效范围和正数步长')
  return { ...options, default: value }
}

/** 创建限额在声明边界完成归一化，后续消费不重复补默认值。 */
type NormalizedIndicatorDeclaration = ScriptIndicatorDeclaration &
  Required<
    Pick<ScriptIndicatorDeclaration, 'max_lines_count' | 'max_boxes_count' | 'max_labels_count'>
  >
let __definition: NormalizedIndicatorDeclaration | undefined
const __inputs: QuickJSScriptDefinition['inputs'] = {}

/** 编译器生成的输入注册入口，默认值由唯一的类型工厂校验。 */
function __declareInput(
  name: string,
  kind: keyof ScriptInput,
  value: never,
  options?: never,
): void {
  const declaration = inputFactories[kind](value, options)
  __inputs[name] = declaration
  if (!Object.hasOwn(params, name)) params[name] = declaration.default
}

/** 读取宿主当前参数，输入身份由编译器按变量名称固定。 */
function __inputValue(name: string): ScriptParamValue {
  return params[name] ?? __inputs[name]!.default
}

/** 声明整文件唯一指标；重复声明或缺少 onBar 时拒绝，并用 inputs 默认值填充参数。 */
function defineIndicator(definition: ScriptIndicatorDeclaration): void {
  if (__definition) throw new TypeError('每个脚本文件只能声明一个指标')
  if (!definition || typeof definition.onBar !== 'function')
    throw new TypeError('指标需要 onBar 函数')
  __definition = {
    ...definition,
    max_lines_count: drawingCount(definition.max_lines_count),
    max_boxes_count: drawingCount(definition.max_boxes_count),
    max_labels_count: drawingCount(definition.max_labels_count),
  }
}

/** 返回元数据快照，不把 VM 函数或序列传回宿主。 */
function __metadata(): QuickJSScriptDefinition {
  if (!__definition) throw new TypeError('脚本需要调用 defineIndicator')
  return {
    name: __definition.name,
    title: __definition.title,
    info: __definition.info,
    position: __definition.position,
    format: __definition.format,
    max_lines_count: __definition.max_lines_count,
    max_boxes_count: __definition.max_boxes_count,
    max_labels_count: __definition.max_labels_count,
    inputs: __inputs,
  }
}

/** 逐 bar 入口；宿主读取元数据后逐根调用。 */
function __onBar(): void {
  if (!__definition) throw new TypeError('脚本需要调用 defineIndicator')
  __definition.onBar()
}

// 裸标识符和 globalThis 成员指向同一份 VM 对象，不修改宿主全局。
Object.assign(globalThis, {
  open,
  high,
  low,
  close,
  volume,
  time,
  plot,
  fill,
  hline,
  defineIndicator,
})
