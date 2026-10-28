/** 校验从 QuickJS 跨边界读取的指标元数据，不信任用户脚本的对象结构。 */
import {
  Color,
  type HLine,
  HLineStyle,
  hLineDash,
  isFormat,
  isPlotKind,
  isShapeLocation,
  isShapeSize,
  isShapeStyle,
  type PlotDeclaration,
  type PlotFillDeclaration,
  PlotKind,
} from '@363045841yyt/klinechart-plot-contracts'
import { ScriptExecutionError } from '../../errors.js'
import { Position, type QuickJSScriptDefinition, type ScriptParamValue } from '../types.js'

/** 判断普通对象，便于逐字段收窄脚本返回值。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** 输入只允许有限数值、字符串和布尔值。 */
function isParam(value: unknown): value is ScriptParamValue {
  return (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
}

/** position 从 VM 跨边界读到的仍是字符串，只有 Position 的两个取值有效。 */
function isPosition(value: unknown): value is Position {
  return value === Position.Main || value === Position.Sub
}

/** 可选字段校验，缺省值由 Plot 采集器补齐。 */
function optional(value: unknown, kind: 'string' | 'number' | 'boolean'): boolean {
  return (
    value === undefined || (typeof value === kind && (kind !== 'number' || Number.isFinite(value)))
  )
}

/** 字符串选项数组：非空且每一项都是字符串。 */
function isOptionsList(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item: unknown) => typeof item === 'string')
  )
}

/** 下拉选项只允许声明在字符串输入上。 */
function isOptionsValid(value: unknown, fallback: unknown): boolean {
  return value === undefined || (typeof fallback === 'string' && isOptionsList(value))
}

/** 检查声明式 Plot 的公共字段；缺省字段由采集器补齐，这里只拒绝错误类型。 */
function hasValidPlotBase(value: Record<string, unknown>): boolean {
  return (
    optional(value.label, 'string') &&
    (value.format === undefined || isFormat(value.format)) &&
    isValidPlotColor(value) &&
    optional(value.textColor, 'string') &&
    optional(value.offset, 'number') &&
    optional(value.visible, 'boolean') &&
    isValidPlotSize(value)
  )
}

/** OHLC 用 null 表示该 bar 不绘制，其余 kind 只接受字符串颜色。 */
function isValidPlotColor(value: Record<string, unknown>): boolean {
  const isOhlc = value.kind === PlotKind.Candle || value.kind === PlotKind.Bar
  return isOhlc
    ? value.color === null || optional(value.color, 'string')
    : optional(value.color, 'string')
}

/** histogram 额外允许正数数值柱宽，其余 kind 只接受尺寸档位。 */
function isValidPlotSize(value: Record<string, unknown>): boolean {
  if (value.size === undefined || isShapeSize(value.size)) return true
  return (
    value.kind === 'histogram' &&
    typeof value.size === 'number' &&
    Number.isFinite(value.size) &&
    value.size > 0
  )
}

/** 虚线数组：缺省或全部为有限数值。 */
function isDash(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.every((item: unknown) => typeof item === 'number' && Number.isFinite(item)))
  )
}

/** 折线与阶梯线只额外声明虚线；线宽由公共 size 决定。 */
function isLineFields(value: Record<string, unknown>): boolean {
  return isDash(value.dash)
}

/** histogram 只额外声明基线。 */
function isHistogramFields(value: Record<string, unknown>): boolean {
  return optional(value.baseline, 'number')
}

/** points 没有专属字段，散点直径由公共 size 决定。 */
function isPointsFields(_value: Record<string, unknown>): boolean {
  return true
}

/** Shape 与 Char 共用位置、尺寸和附加文字校验。 */
function isMarkerFields(value: Record<string, unknown>): boolean {
  return (
    (value.location === undefined || isShapeLocation(value.location)) &&
    (value.size === undefined || isShapeSize(value.size)) &&
    optional(value.text, 'string')
  )
}

/** shape 在标记公共字段之上只额外声明形状枚举。 */
function isShapeFields(value: Record<string, unknown>): boolean {
  return isMarkerFields(value) && (value.style === undefined || isShapeStyle(value.style))
}

/** char 在标记公共字段之上只额外声明单个字符。 */
function isCharFields(value: Record<string, unknown>): boolean {
  return isMarkerFields(value) && optional(value.char, 'string')
}

/** arrow 只额外声明方向颜色；长度由公共 size 决定。 */
function isArrowFields(value: Record<string, unknown>): boolean {
  return optional(value.colorUp, 'string') && optional(value.colorDown, 'string')
}

/** 每种 kind 的专属字段校验；契约新增 kind 时这里会因缺项而编译失败。 */
const PLOT_FIELD_VALIDATORS: Readonly<
  Record<PlotKind, (value: Record<string, unknown>) => boolean>
> = {
  line: isLineFields,
  linebr: isLineFields,
  stepline: isLineFields,
  steplinebr: isLineFields,
  histogram: isHistogramFields,
  columns: (value) => value.size === undefined && isHistogramFields(value),
  points: isPointsFields,
  shape: isShapeFields,
  char: isCharFields,
  arrow: isArrowFields,
  candle: (value) =>
    isOhlcFields(value) && isOptionalColor(value.wickColor) && isOptionalColor(value.borderColor),
  bar: (value) =>
    isOhlcFields(value) && value.wickColor === undefined && value.borderColor === undefined,
}

/** 颜色允许缺省或显式留空；透明度由 CSS 颜色本身携带。 */
function isOptionalColor(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string'
}

/** OHLC 不允许声明的字段：尺寸、基线、标记定位与文字色。 */
const OHLC_FORBIDDEN_FIELDS = ['size', 'baseline', 'location', 'textColor'] as const

/** 可选整数字段；给出时必须为整数，并可要求大于下界。 */
function isIntegerField(value: unknown, minimum?: number): boolean {
  if (value === undefined) return true
  if (typeof value !== 'number' || !Number.isInteger(value)) return false
  return minimum === undefined || value > minimum
}

/** OHLC 无尺寸、基线或标记定位；只保留公共显示元数据。 */
function isOhlcFields(value: Record<string, unknown>): boolean {
  return (
    OHLC_FORBIDDEN_FIELDS.every((field) => value[field] === undefined) &&
    isIntegerField(value.offset) &&
    isIntegerField(value.showLast, 0)
  )
}

/** 校验公共字段后按 kind 查表校验专属字段；未知 kind 一律拒绝。 */
function isPlot(value: unknown): value is PlotDeclaration {
  if (!isRecord(value) || typeof value.name !== 'string' || !value.name) return false
  if (!hasValidPlotBase(value)) return false
  return isPlotKind(value.kind) && PLOT_FIELD_VALIDATORS[value.kind](value)
}

/** 调用参数复用声明校验，name 由位置参数提供，输出类型由 kind 提供。 */
export function readPlotCall(name: unknown, options: unknown, kind: PlotKind): PlotDeclaration {
  const declaration =
    options === undefined
      ? { name, kind }
      : isRecord(options)
        ? { ...options, name, kind }
        : undefined
  if (!isPlot(declaration)) throw new ScriptExecutionError('run', '无效 plot 调用参数')
  return declaration
}

/** 检查填充引用和可选样式；name 由调用处的 title 或 from/to 生成。 */
function isFill(value: unknown): value is PlotFillDeclaration {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.from === 'string' &&
    typeof value.to === 'string' &&
    (value.color === null || typeof value.color === 'string') &&
    optional(value.visible, 'boolean')
  )
}

/** 无效 fill：统一作为运行期错误拒绝。 */
function invalidFill(): never {
  throw new ScriptExecutionError('run', '无效 fill 调用参数')
}

/** 校验 Plot 之间的填充调用；from/to 由句柄的 name 提供。 */
function readPlotFillCall(
  from: unknown,
  to: unknown,
  color: unknown,
  title: unknown,
  options: unknown,
): PlotFillDeclaration {
  if (
    options !== undefined &&
    (!isRecord(options) || Object.keys(options).some((key) => key !== 'visible'))
  ) {
    invalidFill()
  }
  const declaration = {
    ...options,
    name: title === undefined ? `${String(from)}-${String(to)}` : title,
    from,
    to,
    color,
  }
  if (!isFill(declaration)) invalidFill()
  return declaration
}

/** Plot 句柄；fill 借 name 引用整列。 */
function isPlotRef(value: unknown): value is { readonly name: string } {
  return isRecord(value) && typeof value.name === 'string'
}

/** 水平线句柄；fill 借 id 引用整条线。 */
function isHLineRef(value: unknown): value is { readonly hline: string } {
  return isRecord(value) && typeof value.hline === 'string'
}

/** 两条水平线之间的填充：单色、整幅宽度，不按 bar 变化。 */
function readHLineFillCall(
  from: { readonly hline: string },
  to: { readonly hline: string },
  color: unknown,
  title: unknown,
  options: unknown,
): FillCall {
  if (
    options !== undefined &&
    (!isRecord(options) || Object.keys(options).some((key) => key !== 'visible'))
  ) {
    invalidFill()
  }
  if (color !== null && typeof color !== 'string') invalidFill()
  if (title !== undefined && typeof title !== 'string') invalidFill()
  const visible = !(isRecord(options) && options.visible === false)
  return { kind: 'hline', from: from.hline, to: to.hline, color, title, visible }
}

/** fill 的两种语义：两个 Plot 之间的逐 bar 填充，或两条水平线之间的整幅填充。 */
export type FillCall =
  | { readonly kind: 'plot'; readonly declaration: PlotFillDeclaration }
  | {
      readonly kind: 'hline'
      readonly from: string
      readonly to: string
      readonly color: string | null
      readonly title: string | undefined
      readonly visible: boolean
    }

/** 按句柄种类分派 fill；混合句柄与未知句柄直接拒绝。 */
export function readFillCall(
  from: unknown,
  to: unknown,
  color: unknown,
  title: unknown,
  options: unknown,
): FillCall {
  if (isPlotRef(from) && isPlotRef(to))
    return {
      kind: 'plot',
      declaration: readPlotFillCall(from.name, to.name, color, title, options),
    }
  if (isHLineRef(from) && isHLineRef(to)) return readHLineFillCall(from, to, color, title, options)
  invalidFill()
}

/** hline 允许的字段；未知字段直接拒绝，避免拼写错误静默生效。 */
const HLINE_OPTION_KEYS = new Set(['title', 'color', 'linestyle', 'linewidth'])

/** hline 非法：统一作为编译错误拒绝。 */
function invalidHLine(): never {
  throw new ScriptExecutionError('compile', '无效 hline 调用参数')
}

/** 线型收窄；非枚举值一律拒绝。 */
function isHLineStyle(value: unknown): value is HLineStyle {
  return Object.values(HLineStyle).some((style) => style === value)
}

/** 读取 hline 调用；价格必须有限，样式按契约默认值归一化；id 由采集器分配。 */
export function readHLineCall(price: unknown, options: unknown): Omit<HLine, 'id'> {
  if (typeof price !== 'number' || !Number.isFinite(price))
    throw new ScriptExecutionError('compile', 'hline 的 price 必须是有限数值')
  const declaration = options === undefined ? {} : isRecord(options) ? options : invalidHLine()
  for (const key of Object.keys(declaration)) if (!HLINE_OPTION_KEYS.has(key)) invalidHLine()
  if (declaration.title !== undefined && typeof declaration.title !== 'string') invalidHLine()
  if (declaration.color !== undefined && typeof declaration.color !== 'string') invalidHLine()
  if (declaration.linestyle !== undefined && !isHLineStyle(declaration.linestyle)) invalidHLine()
  if (
    declaration.linewidth !== undefined &&
    (typeof declaration.linewidth !== 'number' ||
      !Number.isFinite(declaration.linewidth) ||
      declaration.linewidth <= 0)
  )
    invalidHLine()
  const style = isHLineStyle(declaration.linestyle) ? declaration.linestyle : HLineStyle.style_solid
  return {
    price,
    color: typeof declaration.color === 'string' ? declaration.color : Color.Blue,
    dash: hLineDash(style),
    width: typeof declaration.linewidth === 'number' ? declaration.linewidth : 1,
  }
}

/** 声明级字段通过校验后可直接读取的输入形状。 */
type DefinitionBase = Record<string, unknown> & {
  readonly name: string
  readonly position: Position
  readonly inputs: Record<string, unknown>
}

/** 单个输入声明。 */
type ScriptInputDeclaration = QuickJSScriptDefinition['inputs'][string]

/** 可选文本字段：缺省或去掉空白后非空。 */
function isOptionalNonEmptyText(value: unknown): boolean {
  return value === undefined || (typeof value === 'string' && value.trim() !== '')
}

/** 声明级字段校验；通过后 name/position/inputs 可直接读取。 */
function isDefinitionBase(value: unknown): value is DefinitionBase {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    value.name.trim() !== '' &&
    isOptionalNonEmptyText(value.title) &&
    isOptionalNonEmptyText(value.info) &&
    isPosition(value.position) &&
    (value.format === undefined || isFormat(value.format)) &&
    isRecord(value.inputs)
  )
}

/** 输入声明的可选字段与类型；新增字段只需登记一行。 */
const INPUT_OPTIONAL_FIELDS = [
  ['title', 'string'],
  ['min', 'number'],
  ['max', 'number'],
  ['step', 'number'],
] as const

/** min/max/step 三个可选数值字段；缺省字段不写入声明。 */
function readNumberFields(declaration: Record<string, unknown>): {
  min?: number
  max?: number
  step?: number
} {
  const result: { min?: number; max?: number; step?: number } = {}
  for (const field of ['min', 'max', 'step'] as const)
    if (typeof declaration[field] === 'number') result[field] = declaration[field]
  return result
}

/** 输入声明非法：统一以编译错误拒绝。 */
function invalidInput(key: string): never {
  throw new ScriptExecutionError('compile', `无效输入参数：${key}`)
}

/** 读取单个输入声明；非法字段直接作为编译错误拒绝。 */
function readInput(key: string, declaration: unknown): ScriptInputDeclaration {
  if (!isRecord(declaration) || !isParam(declaration.default)) invalidInput(key)
  for (const [field, kind] of INPUT_OPTIONAL_FIELDS) {
    if (!optional(declaration[field], kind)) invalidInput(key)
  }
  if (!isOptionsValid(declaration.options, declaration.default)) invalidInput(key)
  return {
    default: declaration.default,
    ...(typeof declaration.title === 'string' ? { title: declaration.title } : {}),
    ...(isOptionsList(declaration.options) ? { options: declaration.options } : {}),
    ...readNumberFields(declaration),
  }
}

/** 读取全部输入参数声明。 */
function readInputs(inputs: Record<string, unknown>): QuickJSScriptDefinition['inputs'] {
  const result: QuickJSScriptDefinition['inputs'] = {}
  for (const [key, declaration] of Object.entries(inputs)) {
    result[key] = readInput(key, declaration)
  }
  return result
}

/** 读取已初始化脚本的定义；缺字段或错误类型统一作为编译错误报告。 */
export function readDefinition(value: unknown): QuickJSScriptDefinition {
  if (!isDefinitionBase(value)) {
    throw new ScriptExecutionError(
      'compile',
      `指标需要 name、position 与合法的 format/title/info，position 只能是 ${Position.Main} 或 ${Position.Sub}`,
    )
  }
  return {
    name: value.name,
    ...(typeof value.max_lines_count === 'number'
      ? { max_lines_count: value.max_lines_count }
      : {}),
    ...(typeof value.max_boxes_count === 'number'
      ? { max_boxes_count: value.max_boxes_count }
      : {}),
    ...(typeof value.max_labels_count === 'number'
      ? { max_labels_count: value.max_labels_count }
      : {}),
    ...(typeof value.title === 'string' ? { title: value.title } : {}),
    ...(typeof value.info === 'string' ? { info: value.info } : {}),
    position: value.position,
    ...(isFormat(value.format) ? { format: value.format } : {}),
    inputs: readInputs(value.inputs),
  }
}
