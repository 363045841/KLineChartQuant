/** 验证柱状图批量投影在跨 DPR、亚像素相位与超大原点下仍给出稳定几何。 */
import { describe, expect, it } from 'vitest'
import { calcBarLeftPx } from '../../../viewport/klineConfig.js'
import { projectBarPrimitives } from '../impl/paintBars.js'
import { barVerticalRect } from '../impl/projectBars.js'

describe('柱状图批量投影', () => {
  it.each([1, 1.25, 1.5, 2, 3])('DPR=%s 时柱宽与槽位间距保持设备像素级稳定', (dpr) => {
    for (const origin of [100, 100_000_000]) {
      const buf = new Float64Array(40)
      for (let i = 0; i < 10; i++) {
        buf.set([(origin + i * 12 - 5) / dpr, 0, 11 / dpr, 10 / dpr], i * 4)
      }
      for (const phase of [-0.51, -0.5, -0.49, 0, 0.49, 0.5, 0.51]) {
        const screen = projectBarPrimitives(
          [{ buf, count: 10, color: '' }],
          (origin - 20 + phase) / dpr,
          dpr,
          Number.MAX_SAFE_INTEGER,
        )[0]!
        const data = screen.data
        for (let i = 0; i < 10; i++) {
          expect(Math.round(data[i * 4 + 2]! * dpr)).toBe(11)
          if (i > 0) {
            const gap = (data[i * 4]! - data[(i - 1) * 4]! - data[(i - 1) * 4 + 2]!) * dpr
            expect(gap).toBeCloseTo(1, 6)
          }
        }
      }
    }
  })

  it.each([1, 1.25, 1.5, 2, 3])('DPR=%s 时细影线与实体始终居中对齐', (dpr) => {
    for (const wickWidth of [1, 2]) {
      const bodyWidth = wickWidth === 1 ? 7 : 6
      const center = 100_000_000
      const buf = new Float64Array([
        calcBarLeftPx(center, bodyWidth) / dpr,
        10,
        bodyWidth / dpr,
        20,
        calcBarLeftPx(center, wickWidth) / dpr,
        0,
        wickWidth / dpr,
        40,
      ])
      for (const phase of [0.49, 0.5, 0.51]) {
        const screen = projectBarPrimitives(
          [{ buf, count: 2, color: '' }],
          (center - 20 + phase) / dpr,
          dpr,
          Number.MAX_SAFE_INTEGER,
        )[0]!
        const data = screen.data
        const bodyCenter = data[0]! + data[2]! / 2
        const wickCenter = data[4]! + data[6]! / 2
        expect(bodyCenter).toBeCloseTo(wickCenter, 10)
      }
    }
  })

  it('统一量化上下端值到最小高度', () => {
    expect(barVerticalRect(5, 10, 2)).toEqual({ y: 5, height: 5 })
    expect(barVerticalRect(15, 10, 2)).toEqual({ y: 10, height: 5 })
    expect(barVerticalRect(10, 10, 2)).toEqual({ y: 9.5, height: 0.5 })
    expect(barVerticalRect(9.99, 10, 2)).toEqual({ y: 9.5, height: 0.5 })
    expect(barVerticalRect(10.01, 10, 2)).toEqual({ y: 10, height: 0.5 })
  })
})
