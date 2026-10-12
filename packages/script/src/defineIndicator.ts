/**
 * defineIndicator：指标声明的类型推断入口。
 */
import type { IndicatorDef } from './contracts/script.js'

/**
 * 声明一个指标。
 *
 * 目前是恒等函数：运行时不做任何处理，唯一职责是把类型收窄——
 * ctx 固定为 Ctx，params 由 inputs 推导。真正的执行在引擎里。
 */
export function defineIndicator<P>(def: IndicatorDef<P>): IndicatorDef<P> {
  return def
}
