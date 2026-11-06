/** K 线槽距派生契约：密度只决定逻辑间距，物理像素取整不参与派生。 */
import { describe, expect, it } from 'vitest'

import {
  KLINE_DENSITY,
  KLINE_GAP_RATIOS,
  resolveKLineGapRatio,
} from '@/foundation/config/chartSettings'
import { getPhysicalKLineConfig } from '../klineConfig'
import { kGapFromKWidth } from '../zoom'

describe('kGapFromKWidth', () => {
  it('K 线间距随实体宽度连续增长', () => {
    const gaps = [3, 8, 16, 32, 50].map((width) =>
      kGapFromKWidth(width, 1, KLINE_GAP_RATIOS.standard),
    )
    for (let index = 0; index < gaps.length; index++) {
      if (index > 0) expect(gaps[index]).toBeGreaterThan(gaps[index - 1]!)
    }
    expect(gaps.at(-1)).toBeGreaterThan(3)
    expect(kGapFromKWidth(8.001, 1, 0.6) - kGapFromKWidth(8, 1, 0.6)).toBeCloseTo(0.0006, 10)
  })

  it.each([
    [KLINE_DENSITY.Compact, 0.3],
    [KLINE_DENSITY.Standard, 0.6],
    [KLINE_DENSITY.Loose, 0.9],
  ] as const)('%s 档按唯一映射缩放间隙', (density, ratio) => {
    expect(resolveKLineGapRatio(density)).toBe(ratio)
    expect(kGapFromKWidth(10, 1, ratio)).toBeCloseTo(10 * ratio, 10)
  })

  it('实体退化为 1 物理像素竖线时间距为 0', () => {
    expect(kGapFromKWidth(1, 2, KLINE_GAP_RATIOS.loose)).toBe(0)
    expect(kGapFromKWidth(0.5, 1, KLINE_GAP_RATIOS.compact)).toBe(0)
  })

  it('世界槽距保持小数，连续缩放不被物理像素取整成台阶', () => {
    const geometry = getPhysicalKLineConfig(8, kGapFromKWidth(8, 1, KLINE_GAP_RATIOS.standard), 1)

    expect(geometry.kWidthPx).toBe(7)
    expect(geometry.unitPx).toBeCloseTo(8 + 8 * KLINE_GAP_RATIOS.standard, 10)
    expect(geometry.startXPx).toBeCloseTo(8 * KLINE_GAP_RATIOS.standard, 10)
  })
})
