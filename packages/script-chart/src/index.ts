/**
 * klinechart-script-chart 公共入口。
 *
 * 脚本引擎与图表引擎之间的适配层：把脚本定义注册为图表指标。
 * 宿主可用 registerDefinedScripts 开启一次自动注册，或用 registerScriptIndicator 单独注册。
 */
export { registerDefinedScripts } from './impl/registerDefinedScripts.js'
export { registerScriptIndicator } from './impl/registerScriptIndicator.js'
export type { ScriptIndicatorOptions } from './types.js'
