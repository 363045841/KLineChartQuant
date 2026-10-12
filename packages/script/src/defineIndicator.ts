/**
 * defineIndicator：指标声明的类型推断入口，同时记录已定义的脚本。
 *
 * 记录是自动注册的前提：适配层订阅这份名单，把每个脚本注册进图表。
 * 本模块不认识图表，只提供「有哪些脚本」和「何时新增」。
 */
import type { IndicatorDef } from './contracts/script.js'

/** 已定义的脚本，按声明顺序；参数类型在此擦除，注册时由适配层按声明使用。 */
const definedScripts: IndicatorDef<unknown>[] = []
const listeners = new Set<(script: IndicatorDef<unknown>) => void>()

/**
 * 声明一个指标。
 *
 * 运行时把定义记入名单并通知订阅者，唯一职责之外的职责是收窄类型：
 * ctx 固定为 Ctx，params 由 inputs 推导。同一对象重复声明只记录一次。
 */
export function defineIndicator<P>(def: IndicatorDef<P>): IndicatorDef<P> {
  if (definedScripts.includes(def)) return def
  definedScripts.push(def)
  // 复制一份再通知，避免订阅者在通知过程中改变名单影响本次遍历。
  for (const listener of [...listeners]) listener(def)
  return def
}

/** 返回当前已定义的脚本。 */
export function getDefinedScripts(): readonly IndicatorDef<unknown>[] {
  return definedScripts
}

/**
 * 订阅脚本定义。
 *
 * 先回放已定义的脚本，再持续接收后续定义；返回取消订阅函数。
 */
export function subscribeScriptDefinitions(
  listener: (script: IndicatorDef<unknown>) => void,
): () => void {
  for (const script of [...definedScripts]) listener(script)
  listeners.add(listener)
  return () => listeners.delete(listener)
}
