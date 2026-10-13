/** 使用宿主已有行情执行脚本，完成后返回整份 Plot。 */
import { PlotCollector } from '@363045841yyt/klinechart-plot-contracts'
import type { Bar } from '../../contracts/input.js'
import type { IndicatorDef } from '../../contracts/script.js'
import { SeriesRuntime } from '../../series/impl/seriesRuntime.js'
import { createBarContext, resolveScriptParams } from './execution.js'

// 执行已有行情，逐点收集，成功后返回完整绘图集合。
export function executeScript<P>(
  script: IndicatorDef<P>,
  bars: readonly Bar[],
  overrides?: Partial<P>,
) {
  const collector = new PlotCollector({
    barCount: new Set(bars.map((bar) => bar.time)).size,
    plots: script.plots,
    fills: script.fills,
  })
  const params = resolveScriptParams(script.inputs, overrides)
  const runtime = new SeriesRuntime()
  const ctx = createBarContext(runtime, collector)
  for (const bar of bars) {
    runtime.write(bar)
    script.onBar(ctx, params)
  }
  return collector.collect()
}
