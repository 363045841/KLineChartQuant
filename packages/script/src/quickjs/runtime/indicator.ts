/** VM 内指标 SDK：声明入口、参数默认值与逐 bar 输出。 */

/** 按方法类型输出当前 K 线；name 标识整列，单值方法返回句柄，OHLC 方法仅输出四价格。 */
const plot: ScriptPlot = {
  /** 输出普通折线点，跨空值连接。 */
  Line(value, name, options) {
    return emitPlot(PlotKind.Line, value, name, options)
  },
  /** 输出断线折线点，空值处断开。 */
  LineBR(value, name, options) {
    return emitPlot(PlotKind.LineBR, value, name, options)
  },
  /** 输出阶梯线点，跨空值连接。 */
  StepLine(value, name, options) {
    return emitPlot(PlotKind.StepLine, value, name, options)
  },
  /** 输出断线阶梯线点，空值处断开。 */
  StepLineBR(value, name, options) {
    return emitPlot(PlotKind.StepLineBR, value, name, options)
  },
  /** 输出柱状图值。 */
  Histogram(value, name, options) {
    return emitPlot(PlotKind.Histogram, value, name, options)
  },
  /** 输出随 K 线间距缩放的柱状图。 */
  Columns(value, name, options) {
    return emitPlot(PlotKind.Columns, value, name, options)
  },
  /** 输出散点。 */
  Point(value, name, options) {
    return emitPlot(PlotKind.Points, value, name, options)
  },
  /** 输出形状标记。 */
  Shape(value, name, options) {
    return emitPlot(PlotKind.Shape, value, name, options)
  },
  /** 输出字符标记。 */
  Char(value, name, options) {
    return emitPlot(PlotKind.Char, value, name, options)
  },
  /** 输出数值箭头。 */
  Arrow(value, name, options) {
    return emitPlot(PlotKind.Arrow, value, name, options)
  },
  /** 输出完整蜡烛 OHLC，统一交给宿主校验、归一化和采集。 */
  Candle(open, high, low, close, name, options) {
    __plot(PlotKind.Candle, { open, high, low, close }, name, options)
  },
  /** 输出完整美国线 OHLC，与蜡烛共用数据语义。 */
  Bar(open, high, low, close, name, options) {
    __plot(PlotKind.Bar, { open, high, low, close }, name, options)
  },
}

/** 校验绘图名称、绘图值并传给宿主；null 留空，布尔标记收敛成数值，返回绘图句柄。 */
function emitPlot(
  kind: PlotKind,
  value: number | boolean | null,
  name: string,
  options?: ScriptPlotOptions,
): PlotRef {
  if (typeof name !== 'string' || name.length === 0) throw new TypeError('plot 需要非空的 name')
  if (
    value !== null &&
    typeof value !== 'number' &&
    !((kind === PlotKind.Shape || kind === PlotKind.Char) && typeof value === 'boolean')
  )
    throw new TypeError('plot value 需要数值或 null，shape 和 char 也可以使用布尔条件')
  // kind 由宿主按共享契约校验，这里只负责把 JS 值收敛成数值列。
  __plot(kind, toPlotValue(value), name, options)
  return { name }
}

/** 输出当前 bar 的填充颜色；null 留空，颜色和透明度完全由调用方决定。 */
function fill(
  from: PlotRef,
  to: PlotRef,
  color: ScriptColor | (string & {}) | null,
  title?: string,
  options?: ScriptFillOptions,
): void {
  __fill(from.name, to.name, color, title, options)
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
    if (
      options?.options &&
      (!options.options.length ||
        !options.options.every((item) => typeof item === 'string') ||
        !options.options.includes(value))
    )
      throw new TypeError('input.string 的 options 必须是包含默认值的非空字符串列表')
    return { ...options, default: value }
  },
  /** 创建目标周期输入；默认值和选项都必须是 Timeframe 中登记的周期。 */
  timeframe(value: Timeframe, options?: TimeframeInputOptions) {
    const periods: readonly string[] = Object.values(Timeframe)
    if (!periods.includes(value)) throw new TypeError('input.timeframe 需要 Timeframe 中登记的周期')
    if (
      options?.options &&
      (!options.options.length ||
        !options.options.every((item) => periods.includes(item)) ||
        !options.options.includes(value))
    )
      throw new TypeError('input.timeframe 的 options 必须是包含默认值的周期列表')
    return { ...options, default: value }
  },
}

/** 校验数值默认值、边界和步长，声明由宿主传给参数面板。 */
function numberInput(value: number, options?: NumberInputOptions): InputDef<number> {
  if (
    !Number.isFinite(value) ||
    ![options?.min, options?.max, options?.step].every(
      (item) => item === undefined || Number.isFinite(item),
    ) ||
    (options?.step !== undefined && options.step <= 0) ||
    (options?.min !== undefined && value < options.min) ||
    (options?.max !== undefined && value > options.max)
  )
    throw new TypeError('数值输入需要有限默认值、有效范围和正数步长')
  return { ...options, default: value }
}

let __definition: ScriptIndicatorDeclaration | undefined
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
  if (
    definition.max_lines_count !== undefined &&
    (!Number.isInteger(definition.max_lines_count) ||
      definition.max_lines_count < 1 ||
      definition.max_lines_count > 500)
  )
    throw new RangeError('max_lines_count 必须是 1..500 的整数')
  __definition = definition
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
    inputs: __inputs,
  }
}

/** 逐 bar 入口；宿主读取元数据后逐根调用。 */
function __onBar(): void {
  if (!__definition) throw new TypeError('脚本需要调用 defineIndicator')
  __definition.onBar()
}

// 裸标识符和 globalThis 成员指向同一份 VM 对象，不修改宿主全局。
Object.assign(globalThis, { open, high, low, close, volume, time, plot, fill, defineIndicator })
