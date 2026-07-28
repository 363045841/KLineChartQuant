import { describe, expect, it, vi } from 'vitest'

import type { SymbolSpec } from '../../../controllers/types'
import { comparisonBufferKey, ComparisonManager } from '../comparisonManager'

function createHarness() {
  let specs: ReadonlyArray<SymbolSpec> = []
  const buffers = new Map<
    string,
    {
      loading: { peek: () => boolean; subscribe: (listener: () => void) => () => void }
      data: { subscribe: (listener: () => void) => () => void }
      setSymbol: ReturnType<typeof vi.fn>
      setInlineData: ReturnType<typeof vi.fn>
      getRawData: () => []
    }
  >()
  const createComparisonBuffer = vi.fn((spec: SymbolSpec) => {
    const key = comparisonBufferKey(spec)
    const buffer = {
      loading: { peek: () => false, subscribe: () => () => {} },
      data: { subscribe: () => () => {} },
      setSymbol: vi.fn(),
      setInlineData: vi.fn(),
      getRawData: () => [] as [],
    }
    buffers.set(key, buffer)
    return { key, buffer: buffer as any }
  })
  const setLoading = vi.fn()
  const manager = new ComparisonManager({
    createComparisonBuffer,
    disposeBuffer: (key) => {
      buffers.delete(key)
    },
    getKLineBuffer: (key) => buffers.get(key) as any,
    getKLineBufferKeys: () => [...buffers.keys()],
    scheduleDraw: vi.fn(),
    getSpecs: () => specs,
    setLoading,
  })
  return {
    manager,
    buffers,
    createComparisonBuffer,
    setLoading,
    setSpecs(next: ReadonlyArray<SymbolSpec>) {
      specs = next
    },
  }
}

describe('ComparisonManager runtime projection', () => {
  it('uses unified market identity to separate otherwise identical symbols', () => {
    const cn = comparisonBufferKey({ symbol: '000001', market: 'CN', period: 'daily' })
    const hk = comparisonBufferKey({ symbol: '000001', market: 'HK', period: 'daily' })

    expect(cn).not.toBe(hk)
  })

  it('reads specs from the injected kernel reader without a local shadow', () => {
    const harness = createHarness()
    harness.setSpecs([{ symbol: 'A', period: 'daily' }])
    expect(harness.manager.specs).toEqual([{ symbol: 'A', period: 'daily' }])

    harness.setSpecs([{ symbol: 'B', period: 'weekly' }])
    expect(harness.manager.specs).toEqual([{ symbol: 'B', period: 'weekly' }])
  })

  it('reconciles buffers idempotently from desired specs', () => {
    const harness = createHarness()
    harness.setSpecs([{ symbol: 'A', period: 'daily' }])

    harness.manager.reconcile()
    harness.manager.reconcile()

    expect(harness.createComparisonBuffer).toHaveBeenCalledTimes(1)
    expect([...harness.buffers.keys()]).toEqual([comparisonBufferKey({ symbol: 'A', period: 'daily' })])
  })

  it('keeps separate buffers for the same code from different exchanges', () => {
    const harness = createHarness()
    harness.setSpecs([
      { symbol: '000001', exchange: 'SH', source: 'gotdx', period: 'daily', params: { market: 1 } },
      { symbol: '000001', exchange: 'SZ', source: 'gotdx', period: 'daily', params: { market: 0 } },
    ])

    harness.manager.reconcile()

    expect(harness.createComparisonBuffer).toHaveBeenCalledTimes(2)
    expect(harness.buffers.size).toBe(2)
  })

  it('removes runtime buffers that are absent from desired specs', () => {
    const harness = createHarness()
    harness.setSpecs([
      { symbol: 'A', period: 'daily' },
      { symbol: 'B', period: 'daily' },
    ])
    harness.manager.reconcile()

    harness.setSpecs([{ symbol: 'B', period: 'daily' }])
    harness.manager.reconcile()

    expect([...harness.buffers.keys()]).toEqual([comparisonBufferKey({ symbol: 'B', period: 'daily' })])
    expect(harness.manager.specs).toEqual([{ symbol: 'B', period: 'daily' }])
  })

  it('sets inline data only for a desired comparison', () => {
    const harness = createHarness()
    expect(harness.manager.setData('A', [])).toBe(false)

    harness.setSpecs([{ symbol: 'A', period: 'daily' }])
    harness.manager.reconcile()
    expect(harness.manager.setData('A', [])).toBe(true)
    expect(
      harness.buffers.get(comparisonBufferKey({ symbol: 'A', period: 'daily' }))?.setInlineData,
    ).toHaveBeenCalledWith([])
  })

  it('clearAll only clears runtime resources and loading', () => {
    const harness = createHarness()
    harness.setSpecs([{ symbol: 'A', period: 'daily' }])
    harness.manager.reconcile()

    harness.manager.clearAll()

    expect(harness.buffers.size).toBe(0)
    expect(harness.manager.specs).toEqual([{ symbol: 'A', period: 'daily' }])
    expect(harness.setLoading).toHaveBeenLastCalledWith(false)
  })
})
