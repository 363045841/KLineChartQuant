/**
 * klinechart-script 公共入口。
 *
 * 导出脚本引擎的输入 / 输出契约、脚本契约、指标声明入口与引擎。
 */

export type {
  ArrowOptions,
  ArrowPlot,
  ArrowPlotDeclaration,
  BarPlot,
  BarPlotDeclaration,
  BarPlotOptions,
  CandlePlot,
  CandlePlotDeclaration,
  CandlePlotOptions,
  CharOptions,
  CharPlot,
  CharPlotDeclaration,
  HistogramPlot,
  InputSchema,
  LinePlot,
  OhlcPlot,
  OhlcPlotDeclaration,
  OhlcPlotOptions,
  OhlcPlotPoint,
  Plot,
  PlotCollection,
  PlotDeclaration,
  PlotFill,
  PlotFillDeclaration,
  PlotPoint,
  PointsPlot,
  ScalarPlot,
  ScalarPlotDeclaration,
  ShapeOptions,
  ShapePlot,
  ShapePlotDeclaration,
} from '@363045841yyt/klinechart-plot-contracts'
export {
  Color,
  PlotCollector,
  type PlotCollectorOptions,
  PlotKind,
  ShapeLocation,
  ShapeSize,
  ShapeStyle,
} from '@363045841yyt/klinechart-plot-contracts'
export * from './contracts/input.js'
export * from './contracts/library.js'
export * from './contracts/output.js'
export { ScriptExecutionError } from './errors.js'
export type { TechnicalAnalysisLibrary } from './Library/types.js'
export { builtinScriptSources } from './quickjs/generated/builtinScripts.js'
export { builtinLibraries } from './quickjs/impl/builtinLibraries.js'
export {
  preloadQuickJS,
  prepareQuickJSScript,
  readQuickJSScriptDefinitionSync,
  runQuickJSScript,
  runQuickJSScriptSync,
} from './quickjs/impl/runQuickJSScript.js'
export type {
  PreparedQuickJSScript,
  QuickJSLibrary,
  QuickJSRunOptions,
  QuickJSScriptDefinition,
  ScriptParamValue,
} from './quickjs/types.js'
export { Position } from './quickjs/types.js'
export type { Series } from './series/types.js'
