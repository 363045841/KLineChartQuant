import { describe, expect, it } from 'vitest'

import { toPhysicalRegion } from '../physicalRegion'

describe('toPhysicalRegion', () => {
  it('keeps adjacent fractional-DPR regions contiguous', () => {
    const upper = toPhysicalRegion({ x: 0, y: 0, width: 320, height: 101.2, dpr: 1.25 })
    const lower = toPhysicalRegion({ x: 0, y: 101.2, width: 320, height: 98.8, dpr: 1.25 })

    expect(upper).toEqual({ x: 0, y: 0, width: 400, height: 127 })
    expect(lower).toEqual({ x: 0, y: 127, width: 400, height: 123 })
    expect(upper.y + upper.height).toBe(lower.y)
  })

  it('clips a physical region to the backing canvas', () => {
    expect(
      toPhysicalRegion(
        { x: -0.4, y: 10, width: 100.8, height: 20, dpr: 1.25 },
        { width: 125, height: 100 },
      ),
    ).toEqual({ x: 0, y: 13, width: 125, height: 25 })
  })
})
