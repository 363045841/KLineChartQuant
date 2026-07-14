import { describe, it, expect, vi } from 'vitest'
import { createSignal } from '../../../foundation/reactivity/signal'
import { ComparisonManager } from '../comparisonManager'

function createHarness() {
  const colors = createSignal(new Map<string, string>() as ReadonlyMap<string, string>)
  const buffers = new Map<string, { loading: { peek: () => boolean; subscribe: () => () => void }; data: { subscribe: () => () => void }; setSymbol: () => void; setInlineData: () => void; getRawData: () => [] }>()
  const manager = new ComparisonManager({
    createComparisonBuffer: (spec) => {
      const key = `cmp:${spec.symbol}:${spec.period ?? 'daily'}`
      const buf = {
        loading: { peek: () => false, subscribe: () => () => {} },
        data: { subscribe: () => () => {} },
        setSymbol: vi.fn(),
        setInlineData: vi.fn(),
        getRawData: () => [],
      }
      buffers.set(key, buf)
      return { key, buffer: buf as any }
    },
    disposeBuffer: (key) => {
      buffers.delete(key)
    },
    getKLineBuffer: (key) => buffers.get(key) as any,
    hasKLineBuffer: (key) => buffers.has(key),
    getKLineBufferKeys: () => [...buffers.keys()],
    scheduleDraw: vi.fn(),
    getColors: () => colors.peek(),
    setColors: (next) => colors.set(new Map(next)),
    setLoading: vi.fn(),
  })
  return { manager, colors }
}

describe('ComparisonManager colors SSOT', () => {
  it('reads colors only from injected getColors, not local cache', () => {
    const { manager, colors } = createHarness()
    manager.addSymbol({ symbol: 'A', period: 'daily' }, () => {})
    expect(colors.peek().has('A')).toBe(true)
    expect(manager.getColors().get('A')).toBe(colors.peek().get('A'))

    // kernel is SSOT: external update should be visible via getColors
    colors.set(new Map([['A', '#custom'], ['B', '#bbb']]))
    expect(manager.getColors().get('A')).toBe('#custom')
    expect(manager.getColors().get('B')).toBe('#bbb')
  })

  it('removeSymbol updates kernel colors without local shadow map', () => {
    const { manager, colors } = createHarness()
    manager.addSymbol({ symbol: 'A', period: 'daily' }, () => {})
    manager.addSymbol({ symbol: 'B', period: 'daily' }, () => {})
    expect(manager.removeSymbol('A')).toBe(true)
    expect(colors.peek().has('A')).toBe(false)
    expect(colors.peek().has('B')).toBe(true)
  })

  it('clearAll clears kernel colors', () => {
    const { manager, colors } = createHarness()
    manager.addSymbol({ symbol: 'A', period: 'daily' }, () => {})
    manager.clearAll()
    expect(colors.peek().size).toBe(0)
  })
})
