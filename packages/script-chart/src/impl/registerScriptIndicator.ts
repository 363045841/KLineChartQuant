/**
 * 把脚本定义翻译成图表指标定义。
 *
 * 这是唯一同时认识 script 与 core 的地方：script 负责逐 bar 计算并产出 Plot，
 * core 负责渲染 Plot，本模块只做两者的接线。
 */
import {
  createPlotIndicatorRenderer,
  Indicator,
  IndicatorKind,
  registerIndicatorDefinition,
} from '@363045841yyt/klinechart-core'
import {
  executeScript,
  type IndicatorDef,
  resolveScriptParams,
} from '@363045841yyt/klinechart-script'
import type { ScriptIndicatorOptions } from '../types.js'

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
