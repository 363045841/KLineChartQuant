/**
 * Plot 构建错误码：组装器在构造 PlotCollection 时抛出的具名错误码。
 */

/** Plot 构建错误码常量。 */
export const PLOT_ERROR_CODES = {
  /** 声明了 plots，但输出落在未声明的 Plot id 上。 */
  UNDECLARED_PLOT: 'SCRIPT_UNDECLARED_PLOT',
} as const
