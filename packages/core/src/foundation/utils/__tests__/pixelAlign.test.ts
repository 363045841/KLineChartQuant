/** 屏幕像素对齐：相同相对位置不受世界坐标和滚动量的舍入相位影响。 */
import { describe, expect, it } from 'vitest'
import { projectWorldRectToScreen, worldXToScreenX } from '../pixelAlign.js'

describe('screen pixel alignment', () => {
  it.each([1, 1.25, 1.5, 2, 3])('keeps a stationary anchor stable at DPR=%s', (dpr) => {
    for (const phase of [0.49, 0.5, 0.51, 0.99, 1.01]) {
      expect(worldXToScreenX((100 + phase) / dpr, phase / dpr, dpr)).toBe(100 / dpr)
      const rect = projectWorldRectToScreen((100 + phase) / dpr, 3 / dpr, phase / dpr, dpr)
      expect(rect.x).toBe(100 / dpr)
      expect(rect.width).toBeCloseTo(3 / dpr, 10)
    }
  })
})
