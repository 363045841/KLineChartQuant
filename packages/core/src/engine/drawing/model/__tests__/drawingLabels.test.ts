import { describe, expect, it } from 'vitest'
import {
  defaultLabelTarget,
  drawingLabelTargets,
  normalizeDrawingLabels,
} from '../impl/drawingLabels.js'

describe('drawing label targets', () => {
  it('exposes one target for a vertical line and semantic targets for a rectangle', () => {
    expect(drawingLabelTargets('vertical-line')).toEqual(['line'])
    expect(drawingLabelTargets('rectangle')).toEqual(['top', 'right', 'bottom', 'left', 'inside'])
  })

  it('keys Fibonacci labels to configured ratios across reordering', () => {
    const labels = { 'level:0.5': { text: 'Midpoint', position: 'end' } } as const
    expect(normalizeDrawingLabels('fib-retracement', labels, { levels: [0, 0.5] })).toEqual(labels)
    expect(normalizeDrawingLabels('fib-retracement', labels, { levels: [0.5, 0] })).toEqual(labels)
    expect(normalizeDrawingLabels('fib-retracement', labels, { levels: [0, 1] })).toEqual({})
  })

  it('drops targets that the drawing kind does not define', () => {
    expect(
      normalizeDrawingLabels('vertical-line', {
        line: { text: 'Event', position: 'start' },
        inside: { text: 'Other target', position: 'center' },
      }),
    ).toEqual({ line: { text: 'Event', position: 'start' } })
  })

  it('defaults to the inside target for rectangles and the first target elsewhere', () => {
    expect(defaultLabelTarget('rectangle')).toBe('inside')
    expect(defaultLabelTarget('vertical-line')).toBe('line')
    expect(defaultLabelTarget('fib-retracement', { levels: [0, 0.5] })).toBe('level:0')
    expect(defaultLabelTarget('label')).toBeUndefined()
  })
})
