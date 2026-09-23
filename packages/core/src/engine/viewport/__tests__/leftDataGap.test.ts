import { describe, expect, it } from 'vitest'

import { hasLeftDataGap } from '../viewport'

describe('hasLeftDataGap', () => {
  it('detects the left loading buffer entering the viewport', () => {
    expect(hasLeftDataGap(799.5, 800)).toBe(true)
    expect(hasLeftDataGap(0, 800)).toBe(true)
    expect(hasLeftDataGap(800, 800)).toBe(false)
    expect(hasLeftDataGap(810, 800)).toBe(false)
  })
})
