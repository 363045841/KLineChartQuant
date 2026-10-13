/**
 * klinechart-script 公共入口。
 *
 * 导出脚本引擎的输入 / 输出契约、脚本契约、指标声明入口与引擎。
 */

export type {
  HistogramPlot,
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
export * from './contracts/script.js'
export * from './defineIndicator.js'
export * from './defineLibrary.js'
export { executeScript } from './engine/impl/executeScript.js'
export { resolveScriptParams } from './engine/impl/execution.js'
export { runEngine } from './engine/impl/runEngine.js'
export * from './engine/types.js'
export * from './importLibrary.js'
export { input } from './input.js'
export { builtinLibraries } from './Library/builtinLibraries.js'
export { taLibrary } from './Library/ta.js'
export { createLibraryEnvironment } from './libraryRuntime/impl/createLibraryEnvironment.js'
export type { Series } from './series/types.js'
export { toIndicatorDefinition } from './toIndicatorDefinition.js'
