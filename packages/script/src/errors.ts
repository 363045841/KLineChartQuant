/**
 * 脚本引擎错误码。
 *
 * 错误码集中声明，业务代码引用具名常量而不是散落的字符串字面量。
 */

/** 脚本引擎错误码常量。 */
const SCRIPT_ERROR_CODES = {
  /** Plot 输出了正无穷大或负无穷大。 */
  INFINITE_PLOT_VALUE: 'SCRIPT_INFINITE_PLOT_VALUE',
  /** 脚本源码编译失败。 */
  COMPILE_FAILED: 'SCRIPT_COMPILE_FAILED',
  /** 脚本逐 bar 执行时抛出异常。 */
  RUN_FAILED: 'SCRIPT_RUN_FAILED',
} as const

/** 脚本编译或运行失败，携带阶段与原始信息。 */
export class ScriptExecutionError extends Error {
  readonly code:
    | (typeof SCRIPT_ERROR_CODES)['COMPILE_FAILED']
    | (typeof SCRIPT_ERROR_CODES)['RUN_FAILED']

  /** 按阶段生成诊断，message 为虚拟机返回的原始信息。 */
  constructor(phase: 'compile' | 'run', message: string) {
    super(`脚本${phase === 'compile' ? '编译' : '运行'}失败：${message}`)
    this.name = 'ScriptExecutionError'
    this.code =
      phase === 'compile' ? SCRIPT_ERROR_CODES.COMPILE_FAILED : SCRIPT_ERROR_CODES.RUN_FAILED
  }
}

/** Plot 输出错误，携带输出身份与 bar 位置供宿主展示。 */
export class ScriptPlotError extends Error {
  readonly code = SCRIPT_ERROR_CODES.INFINITE_PLOT_VALUE

  /** 为无穷大的绘图输出生成诊断，barIndex 使用从零开始的下标。 */
  constructor(
    readonly plotName: string,
    readonly barIndex: number,
  ) {
    super(`Plot '${plotName}' 在第 ${barIndex + 1} 根 K 线的结果为无穷大，可能存在除 0 运算`)
    this.name = 'ScriptPlotError'
  }
}
