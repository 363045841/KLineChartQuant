/** 验证条件绘图时，各 Plot 的数据仍按固定 id 输出。 */
import { describe, expect, it } from 'vitest'
import type { Bar, DataFeed, OutputSink, PlotPoint } from '../../index.js'
import { defineIndicator, runEngine } from '../../index.js'

describe('runEngine', () => {
  it('跳过条件 Plot 后，后续 Plot 保持原来的 id', async () => {
    const bars: Bar[] = [
      { time: 0, open: 10, high: 13, low: 9, close: 12, volume: 1 },
      { time: 60_000, open: 12, high: 13, low: 10, close: 11, volume: 1 },
      { time: 120_000, open: 11, high: 15, low: 10, close: 14, volume: 1 },
    ]
    const feed: DataFeed = {
      async *history() {
        for (const bar of bars) yield bar
      },
    }
    const points: { id: string; barIndex: number; point: PlotPoint }[] = []
    const sink: OutputSink = {
      onPlot(id, barIndex, point) {
        points.push({ id, barIndex, point })
      },
      onEvent() {},
    }
    const script = defineIndicator({
      name: 'Conditional plots',
      inputs: {},
      onBar(ctx) {
        if (ctx.close > ctx.open) ctx.plot(ctx.high, { id: 'high', color: 'red' })
        ctx.plot(ctx.close, { id: 'close', color: 'blue' })
      },
    })

    const result = await runEngine({ script, feed, sink, symbol: 'TEST', tf: '1m' })

    expect(result.barCount).toBe(3)
    expect(points).toEqual([
      { id: 'high', barIndex: 0, point: { value: 13, color: 'red' } },
      { id: 'close', barIndex: 0, point: { value: 12, color: 'blue' } },
      { id: 'close', barIndex: 1, point: { value: 11, color: 'blue' } },
      { id: 'high', barIndex: 2, point: { value: 15, color: 'red' } },
      { id: 'close', barIndex: 2, point: { value: 14, color: 'blue' } },
    ])
  })
})
