/**
 * runEngine：逐 bar 驱动指标，把产出转发给 OutputSink。
 */

import { SeriesRuntime } from '../../series/impl/seriesRuntime.js'
import type { RunOptions, RunResult } from '../types.js'
import { createBarContext, resolveScriptParams } from './execution.js'

/** 逐 bar 执行指标，返回处理结果。 */
export async function runEngine<P>(options: RunOptions<P>): Promise<RunResult> {
  const { script, feed, sink, symbol, tf, range } = options
  const params = resolveScriptParams(script.inputs, options.params)
  const runtime = new SeriesRuntime()
  const ctx = createBarContext(runtime, sink)
  for await (const bar of feed.history(symbol, tf, range)) {
    runtime.write(bar)
    script.onBar(ctx, params)
  }
  return { barCount: runtime.index + 1 }
}
