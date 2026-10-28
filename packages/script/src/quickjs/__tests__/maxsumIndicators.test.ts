/** 验证基于 ta.maxsum 的四个内置指标：参考值、端点映射与只画末根的图形。 */
import { describe, expect, it } from 'vitest'
import { barsFromCloses, runShipped, runShippedBars, shippedSource } from '../../__tests__/marketData.js'
import type { Bar } from '../../contracts/input.js'
import { runQuickJSScript } from '../impl/runQuickJSScript.js'

describe('maxsum 内置指标', () => {
  it('BIS 把最强子段的对数收益换算成累计涨幅', async () => {
    // 窗口内 10 → 13 的三根连涨是最强区间，累计涨幅 30%。
    const result = await runShippedBars('bis', barsFromCloses([10, 11, 12, 13, 10, 11]), {
      lookback: 5,
    })
    expect(result.bis?.at(-1)).toBeCloseTo(30, 6)
  })

  it('MDD 用峰谷两端的价格计算算术回撤', async () => {
    // 窗口内峰值 15、谷底 8，回撤 (1 − 8 / 15) × 100。
    const result = await runShippedBars('mdd', barsFromCloses([10, 12, 15, 11, 8, 9, 14]), {
      lookback: 5,
    })
    expect(result.mdd?.at(-1)).toBeCloseTo((1 - 8 / 15) * 100, 4)
  })

  it('MPR 在价差最大的买卖区间下方标注收益率', async () => {
    // 窗口内八元买入、十四元卖出是最大价差，收益率 75%；矩形上边为卖出价。
    const result = await runShipped('mpr', [10, 12, 15, 11, 8, 9, 14], { lookback: 5 })
    expect(result.drawings?.[0]).toMatchObject({
      kind: 'rectangle',
      anchors: [
        { logicalIndex: 4, price: 14 },
        { logicalIndex: 6, price: 8 },
      ],
    })
    expect(result.drawings?.[1]).toMatchObject({
      kind: 'label',
      text: { value: '+75.0%', offsetY: -14 },
    })
  })

  it('MFS 标出净流入最大的区间并在框下方标注累计量', async () => {
    // 前两根量能持续为正，净流入 300 是窗口内最大子段。
    const bars: Bar[] = [
      { time: 0, open: 10, high: 12, low: 9, close: 11, volume: 100 },
      { time: 1, open: 11, high: 14, low: 10, close: 13, volume: 200 },
      { time: 2, open: 13, high: 13.5, low: 9, close: 9.5, volume: 300 },
      { time: 3, open: 9.5, high: 12, low: 9, close: 11.5, volume: 150 },
      { time: 4, open: 11.5, high: 12, low: 10, close: 10.5, volume: 50 },
    ]
    const result = await runQuickJSScript({
      source: shippedSource('mfs'),
      bars,
      params: { lookback: 5 },
    })
    expect(result.drawings?.[0]).toMatchObject({
      kind: 'rectangle',
      anchors: [
        { logicalIndex: 0, price: 14 },
        { logicalIndex: 1, price: 9 },
      ],
    })
    expect(result.drawings?.[1]).toMatchObject({
      kind: 'label',
      text: { value: '300', offsetY: -14 },
    })
  })
})
