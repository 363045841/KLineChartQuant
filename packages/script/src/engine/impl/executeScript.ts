/** 使用宿主已有行情执行脚本，完成后返回整份 Plot。 */
import type { Bar } from '../../contracts/input.js'
import type { IndicatorDef } from '../../contracts/script.js'
import { createBarContext, resolveScriptParams } from './execution.js'
import { PlotCollector } from './plotCollector.js'

// 执行已有行情，逐点收集，成功后返回完整绘图集合。
export function executeScript<P>(
  script: IndicatorDef<P>,
  bars: readonly Bar[],
  overrides?: Partial<P>,
) {
  const collector = new PlotCollector({
    barCount: bars.length,
    plots: script.plots,
    fills: script.fills,
  })
  const params = resolveScriptParams(script.inputs, overrides)
  bars.forEach((bar, index) => script.onBar(createBarContext(bar, index, collector), params))
  return collector.collect()
}
