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
  PlotFill,
  PlotPoint,
  PointsPlot,
} from '@363045841yyt/klinechart-plot-contracts'
export * from './contracts/input.js'
export * from './contracts/output.js'
export * from './contracts/plotDeclaration.js'
export * from './contracts/script.js'
export * from './defineIndicator.js'
export { executeScript } from './engine/impl/executeScript.js'
export { resolveScriptParams } from './engine/impl/execution.js'
export { PlotCollector, type PlotCollectorOptions } from './engine/impl/plotCollector.js'
export { runEngine } from './engine/impl/runEngine.js'
export * from './engine/types.js'
