/**
 * 把脚本定义翻译成图表指标定义。
 *
 * 这是唯一同时认识 script 与 core 的地方：script 负责逐 bar 计算并产出 Plot，
 * core 负责渲染 Plot，本模块只做两者的接线。
 */
import {
  createPlotIndicatorRenderer,
  Indicator,
  type IndicatorInputDef,
  IndicatorKind,
  registerIndicatorDefinition,
} from '@363045841yyt/klinechart-core'
import {
  executeScript,
  type IndicatorDef,
  type InputDef,
  type InputSchema,
  resolveScriptParams,
} from '@363045841yyt/klinechart-script'
import type { ScriptIndicatorOptions } from '../types.js'

/**
 * 提取参数的展示声明。
 *
 * 只取展示字段：默认值与类型仍由 defaultParams 提供，两处不重复存默认值。
 */
function resolveInputDefs<P>(inputs: InputSchema<P>): Record<string, IndicatorInputDef> {
  const defs: Record<string, IndicatorInputDef> = {}
  for (const [key, def] of Object.entries(inputs as Record<string, InputDef<unknown>>)) {
    if (def.title !== undefined) defs[key] = { title: def.title }
  }
  return defs
}

/**
 * 注册一个脚本指标。
 *
 * 注册后脚本进入指标目录，实例的创建、参数更新与删除仍由图表指标 API 管理。
 * 计算在主线程执行，输出完整 Plot 后交给通用 Plot 链路。
 * 缺省位置和显示名取自脚本自身声明，options 可覆盖。
 */
export function registerScriptIndicator<P>(
  script: IndicatorDef<P>,
  options: ScriptIndicatorOptions = {},
): void {
  const main = (options.pane ?? script.pane) === 'main'
  const paneId = main ? 'main' : `sub_${script.name}`
  const displayName = options.displayName ?? script.displayName ?? script.name
  const decorate = Indicator({
    name: script.name,
    source: 'script',
    displayName,
    kind: IndicatorKind.Indicator,
    category: main ? 'main' : 'sub',
    indicatorType: 'other',
    defaultPaneId: paneId,
    allowMainPane: main,
    mainPane: main ? { toActiveConfig: (params, active) => (active ? params : null) } : undefined,
    scale: { label: displayName, decimals: 2 },
    plots: { source: 'collection', series: [] },
    runtime: {
      defaultParams: resolveScriptParams(script.inputs),
      inputDefs: resolveInputDefs(script.inputs),
      compute: (data, params: P) =>
        executeScript(
          script,
          data.map((bar) => ({
            time: bar.timestamp,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume ?? 0,
          })),
          params,
        ),
    },
  })
  class ScriptDefinition {
    static rendererFactory = createPlotIndicatorRenderer(script.name, paneId)
  }
  decorate(ScriptDefinition)
  registerIndicatorDefinition(ScriptDefinition)
}
