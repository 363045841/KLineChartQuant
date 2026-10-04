/** 验证实际几何不变量，覆盖半像素滚动、非整数 DPR 与大世界坐标。 */
import { describe, expect, it } from 'vitest'
import { calcBarLeftPx } from '../../../viewport/klineConfig.js'
import { barVerticalRect, projectBarBatches } from '../impl/projectBars.js'

describe('柱状图物理几何', () => {
  it.each([1, 1.25, 1.5, 2, 3])('DPR=%s 下连续滚动保持柱宽和间距', (dpr) => {
    for (const origin of [100, 100_000_000]) {
      const buf = new Float64Array(40)
      for (let i = 0; i < 10; i++) {
        buf.set([(origin + i * 12 - 5) / dpr, 0, 11 / dpr, 10 / dpr], i * 4)
      }
      for (const phase of [-0.51, -0.5, -0.49, 0, 0.49, 0.5, 0.51]) {
        const screen = projectBarBatches(
          [{ buf, count: 10, color: '' }],
          (origin - 20 + phase) / dpr,
          dpr,
        )[0]!
        for (let i = 0; i < 10; i++) {
          expect(screen.buf[i * 4 + 2]).toBe(11)
          if (i > 0) {
            const gap = screen.buf[i * 4]! - screen.buf[(i - 1) * 4]! - screen.buf[(i - 1) * 4 + 2]!
            expect(gap).toBe(1)
          }
        }
      }
    }
  })

  it.each([1, 1.25, 1.5, 2, 3])('DPR=%s 下粗细影线始终居中', (dpr) => {
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
        const screen = projectBarBatches(
          [{ buf, count: 2, color: '' }],
          (center - 20 + phase) / dpr,
          dpr,
        )[0]!
        const bodyCenter = screen.buf[0]! + screen.buf[2]! / 2
        const wickCenter = screen.buf[4]! + screen.buf[6]! / 2
        expect(bodyCenter).toBe(wickCenter)
      }
    }
  })

  it('统一处理正负柱和零值的最小高度', () => {
    expect(barVerticalRect(5, 10, 2)).toEqual({ y: 5, height: 5 })
    expect(barVerticalRect(15, 10, 2)).toEqual({ y: 10, height: 5 })
    expect(barVerticalRect(10, 10, 2)).toEqual({ y: 9.5, height: 0.5 })
    expect(barVerticalRect(9.99, 10, 2)).toEqual({ y: 9.5, height: 0.5 })
    expect(barVerticalRect(10.01, 10, 2)).toEqual({ y: 10, height: 0.5 })
  })
})
