/**
 * VM 运行时环境声明：宿主注入的内建函数、脚本参数与共享契约类型。
 *
 * 运行时源码按全局脚本编写，跨文件引用走全局作用域，与 QuickJS 逐段 eval 的加载方式一致。
 * 本文件只参与 tsconfig.runtime.json 检查，不进入宿主 TypeScript 程序。
 */

/** 单根 K 线的行情字段序列，按偏移从当前 K 线向过去取值。 */
type Series = import('../../series/types.js').Series

/** 脚本可读取的参数值。 */
type ScriptParamValue = import('../../quickjs/types.js').ScriptParamValue

/** 由 input() 产出的输入声明。 */
type InputDef<T> = import('@363045841yyt/klinechart-plot-contracts').InputDef<T>

/** input() 的展示选项契约。 */
type InputOptions = import('@363045841yyt/klinechart-plot-contracts').InputOptions
/** 输入方法对象，与编辑器共用类型。 */
type ScriptInput = import('../../editor/types.js').ScriptInput
type NumberInputOptions = import('@363045841yyt/klinechart-plot-contracts').NumberInputOptions
type StringInputOptions = import('@363045841yyt/klinechart-plot-contracts').StringInputOptions
type TimeframeInputOptions = import('@363045841yyt/klinechart-plot-contracts').TimeframeInputOptions

/** 内置技术分析库的公开契约。 */
type TechnicalAnalysisLibrary = import('../../Library/types.js').TechnicalAnalysisLibrary

/** 完整脚本的声明与逐 bar 执行回调。 */
type ScriptIndicatorDeclaration = import('../../editor/types.js').ScriptIndicatorDeclaration

/** 完整脚本声明的只读快照。 */
type QuickJSScriptDefinition = import('../../quickjs/types.js').QuickJSScriptDefinition

/** 宿主注入：按字段与偏移读取行情，历史不足返回 NaN。 */
declare function __read(field: string, offset: number): number

// __count 由 runtime-internals.d.ts 声明，运行时与内置库展示共用同一签名。
/** 宿主注入的本次数据总根数，仅供末根判断。 */
declare function __barCount(): number
type DrawingBoxApi = import('@363045841yyt/klinechart-plot-contracts').DrawingBoxApi
type DrawingLabelApi = import('@363045841yyt/klinechart-plot-contracts').DrawingLabelApi
declare const createDrawingBoxApi: typeof import('@363045841yyt/klinechart-plot-contracts').createDrawingBoxApi
declare const createDrawingLabelApi: typeof import('@363045841yyt/klinechart-plot-contracts').createDrawingLabelApi
declare const drawingCount: typeof import('@363045841yyt/klinechart-plot-contracts').drawingCount
type DrawingObject = import('@363045841yyt/klinechart-plot-contracts').DrawingObject
type DrawingLineApi = import('@363045841yyt/klinechart-plot-contracts').DrawingLineApi
type ChartPoint = import('@363045841yyt/klinechart-plot-contracts').ChartPoint
type ScriptColor = import('@363045841yyt/klinechart-plot-contracts').Color
declare const createDrawingLineApi: typeof import('@363045841yyt/klinechart-plot-contracts').createDrawingLineApi

/** 宿主注入：上报当前 K 线的绘图点。 */
declare function __plot(
  kind: PlotKind,
  value:
    | number
    | null
    | { open: number | null; high: number | null; low: number | null; close: number | null },
  name: string,
  options?: ScriptPlotOptions | import('@363045841yyt/klinechart-plot-contracts').CandlePlotOptions,
): void

/** 调用处的样式选项，与编辑器共用契约。 */
type ScriptPlotOptions = import('../../editor/types.js').ScriptPlotOptions

/** 水平参考线的调用样式，与编辑器共用契约。 */
type HLineOptions = import('@363045841yyt/klinechart-plot-contracts').HLineOptions

/** OHLC 方法的公共样式选项；蜡烛与美国线各自在其上追加字段。 */
type CandlePlotOptions = import('@363045841yyt/klinechart-plot-contracts').CandlePlotOptions

/** 绘图方法对象，与编辑器共用契约。 */
type ScriptPlot = import('../../editor/types.js').ScriptPlot

/** plot.* 返回的绘图句柄，与编辑器共用契约。 */
type PlotRef = import('../../editor/types.js').PlotRef

/** hline 返回的水平线句柄。 */
type HLineRef = import('@363045841yyt/klinechart-plot-contracts').HLineRef

/** fill 的可选样式，与编辑器共用契约。 */
type ScriptFillOptions = import('../../editor/types.js').ScriptFillOptions

/** 宿主注入：登记两个 Plot 或两条水平线之间的填充。 */
declare function __fill(
  from: PlotRef | HLineRef,
  to: PlotRef | HLineRef,
  color: ScriptColor | (string & {}) | null,
  title?: string,
  options?: ScriptFillOptions,
): void

/** 宿主注入：登记图表级水平线并返回句柄 id；只允许在文件顶层调用。 */
declare function __hline(price: number, options?: HLineOptions): string

/** 宿主注入：脚本参数，键为 inputs 中声明的参数名。 */
declare const params: Record<string, ScriptParamValue>

/** 宿主注入的跨周期计算输入，仅包含可克隆数据。 */
declare const __requestContext: import('../../request/types.js').RequestExecution
declare function __emitRequestResult(value: import('../../request/types.js').RequestValue): void
