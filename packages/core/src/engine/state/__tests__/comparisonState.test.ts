import { describe, it, expect } from 'vitest'
import { createComparisonState } from '../comparisonState'

describe('comparisonState', () => {
  it('external mutation of returned colors map does not alter store', () => {
    const m = createComparisonState()
    m.actions.setColors(new Map([['A', '#fff']]))
    const colors = m.readonly.colors() as Map<string, string>
    expect(() => colors.set('B', '#000')).toThrow()
    expect(m.readonly.colors().has('B')).toBe(false)
    expect(m.readonly.colors().get('A')).toBe('#fff')
  })

  it('setColors copies input map', () => {
    const m = createComparisonState()
    const input = new Map([['A', '#fff']])
    m.actions.setColors(input)
    input.set('B', '#000')
    expect(m.readonly.colors().has('B')).toBe(false)
  })

  it('dispose resets colors and loading atomically', () => {
    const m = createComparisonState()
    m.actions.setColors(new Map([['A', '#fff']]))
    m.actions.setLoading(true)
    const snaps: Array<{ size: number; loading: boolean }> = []
    m.readonly.colors.subscribe(() => {
      snaps.push({ size: m.readonly.colors.peek().size, loading: m.readonly.loading.peek() })
    })
    m.readonly.loading.subscribe(() => {
      snaps.push({ size: m.readonly.colors.peek().size, loading: m.readonly.loading.peek() })
    })
    m.dispose()
    expect(m.readonly.colors().size).toBe(0)
    expect(m.readonly.loading()).toBe(false)
    for (const s of snaps) {
      expect(s).toEqual({ size: 0, loading: false })
    }
  })
})
