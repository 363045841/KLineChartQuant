/** 将脚本注册为普通图表指标，计算完成后交给通用 Plot 链路。 */
import {
  executeScript,
  type IndicatorDef,
  resolveScriptParams,
} from '@363045841yyt/klinechart-script'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { registerIndicatorDefinition } from '@/engine/indicators/indicatorDefinitionRegistry.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'
import type { ScriptIndicatorOptions } from '../types.js'

// 注册脚本定义，实例创建和删除仍由图表指标 API 管理。
export function registerScriptIndicator<P extends Record<string, number | string | boolean>>(
  script: IndicatorDef<P>,
  options: ScriptIndicatorOptions = {},
): void {
  const main = options.pane === 'main'
  const paneId = main ? 'main' : `sub_${script.name}`
  const decorate = Indicator({
    name: script.name,
    source: 'script',
    displayName: options.displayName ?? script.name,
    kind: IndicatorKind.Indicator,
    category: main ? 'main' : 'sub',
    indicatorType: 'other',
    defaultPaneId: paneId,
    allowMainPane: main,
    mainPane: main ? { toActiveConfig: (params, active) => (active ? params : null) } : undefined,
    scale: { label: options.displayName ?? script.name, decimals: 2 },
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
    static rendererFactory = plotRenderer(script.name, paneId)
  }
  decorate(ScriptDefinition)
  registerIndicatorDefinition(ScriptDefinition)
}
