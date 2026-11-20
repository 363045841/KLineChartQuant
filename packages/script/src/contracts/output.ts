/**
 * 输出契约：脚本产出的 Plot 与事件流。
 *
 * 与图表共用的日志、绘图点与输出订阅类型统一由 plot-contracts 提供，此处只做脚本侧再导出。
 */

export type {
  LogEvent,
  LogLevel,
  PlotPoint,
  ScriptOutputSource,
} from '@363045841yyt/klinechart-plot-contracts'
