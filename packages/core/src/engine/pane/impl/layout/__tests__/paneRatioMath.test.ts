import { describe, expect, it } from 'vitest'

import { normalizeVisiblePaneRatios } from '../paneRatioMath'

describe('paneRatioMath', () => {
  it('normalizes visible panes to sum 1 and leaves hidden raw', () => {
    const specs = [
      { id: 'main', visible: true },
      { id: 'MACD', visible: true },
      { id: 'hidden', visible: false },
    ]
    const ratios = { main: 3, MACD: 1, hidden: 0.5 }
    const next = normalizeVisiblePaneRatios(specs, ratios)
    expect((next.main ?? 0) + (next.MACD ?? 0)).toBeCloseTo(1, 10)
    expect(next.hidden).toBe(0.5)
    expect((next.main ?? 0) / (next.MACD ?? 1)).toBeCloseTo(3, 5)
  })

  it('assigns equal ratios when all visible inputs are non-positive', () => {
    const specs = [
      { id: 'a', visible: true },
      { id: 'b', visible: true },
    ]
    const next = normalizeVisiblePaneRatios(specs, { a: 0, b: -1 })
    expect(next.a).toBeCloseTo(0.5, 10)
    expect(next.b).toBeCloseTo(0.5, 10)
  })

  it('is a no-op for empty visible set', () => {
    const specs = [{ id: 'x', visible: false }]
    const ratios = { x: 2 }
    expect(normalizeVisiblePaneRatios(specs, ratios)).toEqual({ x: 2 })
  })
})
