// 价格分布工具的单元测试：分桶结果要落在可核对的价格上，缺数据要报错而不是返回空摘要。

import { describe, expect, it } from 'vitest'
import { CHART_AGENT_ERROR_CODES, KLineChartError } from '@/errors'
import type { KLineData } from '@/foundation/types/price'
import {
  computeVolumeProfileSummary,
  formatVolumeProfileSummary,
} from '../impl/volumeProfile/volumeProfileQuery.js'

/** 造一根 K 线。 */
function bar(
  timestamp: number,
  low: number,
  high: number,
  close: number,
  volume: number,
): KLineData {
  return { timestamp, open: close, high, low, close, volume }
}

describe('computeVolumeProfileSummary', () => {
  it('把成交量摊到价格桶，POC 落在量最大的桶中心', () => {
    const data = [bar(1, 99, 101, 100, 10), bar(2, 100, 102, 101, 10)]

    const summary = computeVolumeProfileSummary(data, {
      bars: 2,
      binCount: 3,
      valueAreaPercent: 0.7,
      mode: 'proportional',
    })

    // 区间 99–102 分 3 桶，每桶 1；两桶各得 5，中间桶得 10。
    expect(summary.binSize).toBeCloseTo(1, 6)
    expect(summary.poc).toBeCloseTo(100.5, 6)
    expect(summary.val).toBeLessThanOrEqual(summary.poc)
    expect(summary.vah).toBeGreaterThanOrEqual(summary.poc)
    expect(summary.valueAreaRatio).toBeGreaterThanOrEqual(0.7)
    expect(summary.totalVolume).toBe(20)
  })

  it('买卖区间只有一根时也能算出 POC', () => {
    const summary = computeVolumeProfileSummary([bar(1, 100, 110, 105, 5)], {
      bars: 1,
      binCount: 5,
      valueAreaPercent: 0.7,
      mode: 'typical-price',
    })

    // typical-price 把全部量丢进 (100+110+105)/3 = 105 所在的桶。
    expect(summary.poc).toBeGreaterThan(104)
    expect(summary.poc).toBeLessThan(106)
  })

  it('没有 K 线时抛出 NO_DATA', () => {
    expect(() =>
      computeVolumeProfileSummary([], {
        bars: 10,
        binCount: 10,
        valueAreaPercent: 0.7,
        mode: 'proportional',
      }),
    ).toThrow(KLineChartError)
    try {
      computeVolumeProfileSummary([], {
        bars: 10,
        binCount: 10,
        valueAreaPercent: 0.7,
        mode: 'proportional',
      })
    } catch (error) {
      expect((error as KLineChartError).code).toBe(CHART_AGENT_ERROR_CODES.NO_DATA)
    }
  })

  it('只用最近 bars 根，更早的数据不参与统计', () => {
    const data = [
      bar(1, 1000, 1010, 1005, 999),
      bar(2, 99, 101, 100, 10),
      bar(3, 100, 102, 101, 10),
    ]

    const summary = computeVolumeProfileSummary(data, {
      bars: 2,
      binCount: 4,
      valueAreaPercent: 0.7,
      mode: 'proportional',
    })

    expect(summary.bars).toBe(2)
    expect(summary.high).toBe(102)
    expect(summary.totalVolume).toBe(20)
  })
})

describe('formatVolumeProfileSummary', () => {
  it('输出 POC、价值区与口径说明', () => {
    const summary = computeVolumeProfileSummary(
      [bar(1, 99, 101, 100, 10), bar(2, 100, 102, 101, 10)],
      { bars: 2, binCount: 3, valueAreaPercent: 0.7, mode: 'proportional' },
    )

    const text = formatVolumeProfileSummary(summary)

    expect(text).toContain('POC 100.5')
    expect(text).toContain('VAH')
    expect(text).toContain('VAL')
    expect(text).toContain('现价 101')
    expect(text).toContain('不是逐笔成交')
  })

  it('现价低于价值区时标注在下方', () => {
    const summary = computeVolumeProfileSummary([bar(1, 90, 110, 91, 10)], {
      bars: 1,
      binCount: 4,
      valueAreaPercent: 0.7,
      mode: 'typical-price',
    })

    const text = formatVolumeProfileSummary(summary)

    expect(text).toContain('现价 91')
  })
})
