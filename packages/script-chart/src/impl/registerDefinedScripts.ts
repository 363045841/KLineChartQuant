/**
 * 自动注册：订阅脚本定义，把每个声明的脚本注册进图表。
 *
 * 宿主在启动时开启一次即可，之后每次 defineIndicator 都会自动进入指标目录。
 */
import { subscribeScriptDefinitions } from '@363045841yyt/klinechart-script'
import { registerScriptIndicator } from './registerScriptIndicator.js'

let started = false

/**
 * 开启脚本自动注册：回放已定义的脚本，并持续注册之后声明的脚本。
 *
 * 重复调用只生效一次，便于宿主在热更新或多入口启动时安全调用。
 */
export function registerDefinedScripts(): void {
  if (started) return
  started = true
  subscribeScriptDefinitions((script) => registerScriptIndicator(script))
}
