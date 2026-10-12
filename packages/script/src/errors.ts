/**
 * 脚本引擎错误码。
 *
 * 错误码集中声明，业务代码引用具名常量而不是散落的字符串字面量。
 */

/** 脚本引擎错误码常量。 */
export const SCRIPT_ERROR_CODES = {
  /** 脚本声明了 plots，但输出落在未声明的 Plot id 上。 */
  UNDECLARED_PLOT: 'SCRIPT_UNDECLARED_PLOT',
  /** Plot 输出了正无穷大或负无穷大。 */
  INFINITE_PLOT_VALUE: 'SCRIPT_INFINITE_PLOT_VALUE',
} as const

/** 脚本引擎错误码取值。 */
export type ScriptErrorCode = (typeof SCRIPT_ERROR_CODES)[keyof typeof SCRIPT_ERROR_CODES]

/** Plot 输出错误，携带输出身份与 bar 位置供宿主展示。 */
export class ScriptPlotError extends Error {
  readonly code = SCRIPT_ERROR_CODES.INFINITE_PLOT_VALUE

  /** 为无穷大的绘图输出生成诊断，barIndex 使用从零开始的下标。 */
  constructor(
    readonly plotId: string,
    readonly barIndex: number,
  ) {
    super(`Plot '${plotId}' 在第 ${barIndex + 1} 根 K 线的结果为无穷大，可能存在除 0 运算`)
    this.name = 'ScriptPlotError'
  }
}
