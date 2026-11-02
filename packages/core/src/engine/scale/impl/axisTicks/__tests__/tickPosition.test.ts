import { describe, expect, it } from 'vitest'

import { calculateValueTickPositions } from '../tickPosition'

describe('calculateValueTickPositions', () => {
  // 百分比刻度锚定 0 且等步长；内容区上下内缩时，刻度仍可落到可见范围之外。
  it('anchors percent ticks at 0 and lets them extend past the content range', () => {
    const anchored = calculateValueTickPositions({
      contentTop: 0,
      contentBottom: 240,
      valueMin: -1.3,
      valueMax: 2.4,
      scaleType: 'percent',
      isMain: true,
    })

    const values = anchored.map((tick) => tick.value)
    const zeroIndex = values.indexOf(0)
    expect(zeroIndex).toBeGreaterThan(0)
    expect(zeroIndex).toBeLessThan(values.length - 1)

    const step = values[zeroIndex - 1]! - values[zeroIndex]!
    expect(step).toBeGreaterThan(0)
    for (let i = 1; i < values.length; i++) {
      expect(values[i - 1]! - values[i]!).toBeCloseTo(step, 10)
    }
    for (const value of values) {
      expect(value / step).toBeCloseTo(Math.round(value / step), 10)
    }

    const inset = calculateValueTickPositions({
      contentTop: 10,
      contentBottom: 230,
      valueMin: -0.5,
      valueMax: 0.5,
      scaleType: 'percent',
      isMain: true,
    })

    expect(inset.map((tick) => tick.value)).toContain(0)
    expect(inset.some((tick) => tick.y < 10 || tick.y > 230)).toBe(true)
  })
})
