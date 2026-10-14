/** VM 内指标 SDK：声明入口、参数默认值与逐 bar 输出。 */

/** 输出当前 K 线的一个绘图点；kind 决定图形，NaN 表示空点，宿主负责与 K 线下标对齐。 */
function plot(kind: 'shape', value: number | boolean, options: ScriptPlotOptions): void
function plot(kind: PlotKind, value: number, options: ScriptPlotOptions): void
function plot(kind: PlotKind, value: number | boolean, options: ScriptPlotOptions): void {
  if (!options || typeof options.id !== 'string') throw new TypeError('plot 需要 { id }')
  if (!Object.values(PlotKind).includes(kind)) throw new TypeError(`未知 plot kind：${kind}`)
  if (typeof value !== 'number' && !(kind === PlotKind.Shape && typeof value === 'boolean'))
    throw new TypeError('plot value 需要数值，shape 也可以使用布尔条件')
  __plot(kind, Number(value), options)
}

/** 声明输入默认值与展示选项；options 只在字符串参数上生成下拉。 */
function input<T extends ScriptParamValue>(value: T, options?: InputOptions): InputDef<T> {
  return { ...options, default: value }
}

let __definition: ScriptIndicatorDeclaration | undefined

/** 声明整文件唯一指标；重复声明或缺少 onBar 时拒绝，并用 inputs 默认值填充参数。 */
function defineIndicator(definition: ScriptIndicatorDeclaration): void {
  if (__definition) throw new TypeError('每个脚本文件只能声明一个指标')
  if (!definition || typeof definition.onBar !== 'function')
    throw new TypeError('指标需要 onBar 函数')
  __definition = definition
  for (const [key, entry] of Object.entries(definition.inputs)) {
    if (!Object.hasOwn(params, key)) params[key] = entry.default
  }
}

/** 返回元数据快照，不把 VM 函数或序列传回宿主。 */
function __metadata(): QuickJSScriptDefinition {
  if (!__definition) throw new TypeError('脚本需要调用 defineIndicator')
  return {
    name: __definition.name,
    displayName: __definition.displayName,
    pane: __definition.pane,
    inputs: __definition.inputs,
    plots: __definition.plots,
    fills: __definition.fills,
  }
}

/** 逐 bar 入口；宿主读取元数据后逐根调用。 */
function __onBar(): void {
  if (!__definition) throw new TypeError('脚本需要调用 defineIndicator')
  __definition.onBar()
}

// 裸标识符和 globalThis 成员指向同一份 VM 对象，不修改宿主全局。
Object.assign(globalThis, { open, high, low, close, volume, time, plot, input, defineIndicator })
