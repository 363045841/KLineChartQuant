import { describe, expect, it } from 'vitest'

import { resolveAreaLabelLayout } from '../impl/labelLayout.js'

describe('area label layout', () => {
  it('anchors text to the left, center or right of its bounds', () => {
    expect(resolveAreaLabelLayout(10, 110, 'start')).toEqual({ x: 16, align: 'left' })
    expect(resolveAreaLabelLayout(10, 110, 'center')).toEqual({ x: 60, align: 'center' })
    expect(resolveAreaLabelLayout(10, 110, 'end')).toEqual({ x: 104, align: 'right' })
  })

  it('keeps the inset inside narrow areas', () => {
    expect(resolveAreaLabelLayout(10, 14, 'start')).toEqual({ x: 12, align: 'left' })
  })
})
