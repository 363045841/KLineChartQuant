/**
 * klinechart-script 公共入口。
 *
 * 导出脚本引擎的输入 / 输出契约、脚本契约、指标声明入口与引擎。
 */

export type {
  HistogramPlot,
  InputSchema,
  LinePlot,
  Plot,
  PlotCollection,
  PlotDeclaration,
  PlotFill,
  PlotFillDeclaration,
  PlotPoint,
  PointsPlot,
} from '@363045841yyt/klinechart-plot-contracts'
export { PlotCollector, type PlotCollectorOptions } from '@363045841yyt/klinechart-plot-contracts'
export * from './contracts/input.js'
export * from './contracts/library.js'
export * from './contracts/output.js'
export { ScriptExecutionError } from './errors.js'
export type { TechnicalAnalysisLibrary } from './Library/types.js'
export { builtinLibraries } from './quickjs/impl/builtinLibraries.js'
export {
  preloadQuickJS,
  readQuickJSScriptDefinitionSync,
  runQuickJSScript,
  runQuickJSScriptSync,
} from './quickjs/impl/runQuickJSScript.js'
export type {
  QuickJSLibrary,
  QuickJSRunOptions,
  QuickJSScriptDefinition,
  ScriptParamValue,
} from './quickjs/types.js'
export type { Series } from './series/types.js'
