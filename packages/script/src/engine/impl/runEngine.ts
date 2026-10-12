/**
 * runEngine：逐 bar 驱动指标，把产出转发给 OutputSink。
 */

import type { RunOptions, RunResult } from '../types.js'
import { createBarContext, resolveScriptParams } from './execution.js'

/** 逐 bar 执行指标，返回处理结果。 */
export async function runEngine<P>(options: RunOptions<P>): Promise<RunResult> {
  const { script, feed, sink, symbol, tf, range } = options
  const params = resolveScriptParams(script.inputs, options.params)
  let barCount = 0
  for await (const bar of feed.history(symbol, tf, range)) {
    script.onBar(createBarContext(bar, barCount, sink), params)
    barCount++
  }
  return { barCount }
}
