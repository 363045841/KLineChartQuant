/**
 * 把脚本定义注册为图表指标。
 *
 * 脚本先收敛为中立 IndicatorDefinition（compute 端口），再交给 core 的
 * registerPlotIndicator；本模块只做参数覆盖，不接触 core 的指标模型。
 */
import { registerPlotIndicator } from '@363045841yyt/klinechart-core'
import { type IndicatorDef, toIndicatorDefinition } from '@363045841yyt/klinechart-script'
import type { ScriptIndicatorOptions } from '../types.js'

/**
 * 注册一个脚本指标。
 *
 * 缺省位置与显示名取自脚本自身声明，options 可覆盖。
 */
export function registerScriptIndicator<P>(
  script: IndicatorDef<P>,
  options: ScriptIndicatorOptions = {},
): void {
  const definition = toIndicatorDefinition(script)
  registerPlotIndicator({
    ...definition,
    displayName: options.displayName ?? definition.displayName,
    pane: options.pane ?? definition.pane,
  })
}
