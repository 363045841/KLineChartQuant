/**
 * runEngine：逐 bar 驱动指标，把产出转发给 OutputSink。
 */
import type { Bar } from '../../contracts/input.js'
import type { OutputSink } from '../../contracts/output.js'
import type { Ctx, InputDef, InputSchema } from '../../contracts/script.js'
import type { RunOptions, RunResult } from '../types.js'

/** 为单根 bar 构造执行上下文，按脚本指定的 Plot id 输出绘图点。 */
function createBarContext(bar: Bar, barIndex: number, sink: OutputSink): Ctx {
  return {
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    plot(value, options) {
      sink.onPlot(options.id, barIndex, { value, color: options.color })
    },
  }
}

/** 由输入声明解析出本次运行的参数对象（仅填默认值）。 */
function resolveParams<P>(inputs: InputSchema<P>): P {
  const params: Record<string, unknown> = {}
  for (const [key, input] of Object.entries(inputs as Record<string, InputDef<unknown>>)) {
    params[key] = input.default
  }
  return params as P
}

/** 逐 bar 执行指标，返回处理结果。 */
export async function runEngine<P>(options: RunOptions<P>): Promise<RunResult> {
  const { script, feed, sink, symbol, tf, range } = options
  const params = resolveParams(script.inputs)
  let barCount = 0
  for await (const bar of feed.history(symbol, tf, range)) {
    script.onBar(createBarContext(bar, barCount, sink), params)
    barCount++
  }
  return { barCount }
}
