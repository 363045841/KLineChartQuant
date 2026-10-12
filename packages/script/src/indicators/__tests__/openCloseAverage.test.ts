/**
 * Open/Close 平均值指标的喂数据用例。
 *
 * 用固定的三根 K 线驱动引擎，断言每根 bar 的 Plot 输出等于 (open + close) / 2。
 */
import { describe, expect, it } from 'vitest'
import type { Bar, DataFeed, OutputSink } from '../../index.js'
import { runEngine } from '../../index.js'
import { openCloseAverage } from '../openCloseAverage.js'

/** 固定 K 线：每根的 (open + close) / 2 依次为 15 / 150 / 10，与四价均值不同。 */
const bars: Bar[] = [
  { time: 1_700_000_000_000, open: 10, high: 30, low: 5, close: 20, volume: 100 },
  { time: 1_700_000_060_000, open: 100, high: 210, low: 80, close: 200, volume: 120 },
  { time: 1_700_000_120_000, open: 5, high: 40, low: 2, close: 15, volume: 140 },
]

/** 内存 DataFeed：把固定 K 线按时间升序喂给引擎。 */
const feed: DataFeed = {
  async *history() {
    for (const bar of bars) yield bar
  },
}

/** 记录型 OutputSink：按 bar 下标收集 Plot 的值。 */
function createRecordingSink() {
  const values: number[] = []
  const sink: OutputSink = {
    onPlot(_id, barIndex, point) {
      values[barIndex] = point.value
    },
    onEvent() {},
  }
  return { sink, values }
}

describe('openCloseAverage', () => {
  it('每根 bar 输出 (open + close) / 2', async () => {
    const { sink, values } = createRecordingSink()

    await runEngine({ script: openCloseAverage, feed, sink, symbol: 'TEST', tf: '1m' })

    expect(values).toEqual([15, 150, 10])
  })
})
