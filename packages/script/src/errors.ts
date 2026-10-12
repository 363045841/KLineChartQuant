/**
 * 脚本引擎错误码。
 *
 * 错误码集中声明，业务代码引用具名常量而不是散落的字符串字面量。
 */

/** 脚本引擎错误码常量。 */
export const SCRIPT_ERROR_CODES = {
  /** 脚本声明了 plots，但输出落在未声明的 Plot id 上。 */
  UNDECLARED_PLOT: 'SCRIPT_UNDECLARED_PLOT',
} as const

/** 脚本引擎错误码取值。 */
export type ScriptErrorCode = (typeof SCRIPT_ERROR_CODES)[keyof typeof SCRIPT_ERROR_CODES]
