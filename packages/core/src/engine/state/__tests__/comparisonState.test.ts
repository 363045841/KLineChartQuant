import { describe, it, expect } from 'vitest'
import type { SymbolSpec } from '../../../controllers/types'
import { symbolSpecIdentityKey } from '../../data/symbolIdentity'
import { ChartStateKernel } from '../chartStateKernel'
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

  it('stores immutable comparison specs and derives active from their count', () => {
    const m = createComparisonState()
    expect(m.readonly.active()).toBe(false)

    const specs: SymbolSpec[] = [{ symbol: 'CMP', market: 'CN', period: 'weekly' }]
    m.actions.setSpecs(specs)

    const stored = m.readonly.specs.peek()
    expect(stored).toEqual(specs)
    expect(Object.isFrozen(stored)).toBe(true)
    expect(Object.isFrozen(stored[0])).toBe(true)
    expect(m.readonly.active()).toBe(true)

    m.actions.setSpecs([])
    expect(m.readonly.active()).toBe(false)
  })
})

describe('ChartStateKernel comparison selection transaction', () => {
  function createKernel(): ChartStateKernel {
    return new ChartStateKernel({
      initialOptions: {
        minKWidth: 3,
        maxKWidth: 20,
        zoomLevelCount: 10,
        bottomAxisHeight: 24,
        rightAxisWidth: 60,
        leftAxisWidth: 0,
        yPaddingPx: 4,
        panes: [{ id: 'main', ratio: 1, visible: true, role: 'price' }],
      },
      initialZoomLevel: 0,
      scheduleDraw: () => {},
    })
  }

  it('publishes comparison specs and colors without an intermediate snapshot', () => {
    const kernel = createKernel()
    const snapshots: Array<{ specs: string[]; colors: string[] }> = []
    const capture = () => {
      snapshots.push({
        specs: kernel.comparison.readonly.specs.peek().map((spec) => spec.symbol),
        colors: [...kernel.comparison.readonly.colors.peek().keys()],
      })
    }
    kernel.comparison.readonly.specs.subscribe(capture)
    kernel.comparison.readonly.colors.subscribe(capture)

    kernel.actions.setComparisonSpecs([{ symbol: 'CMP', market: 'CN', period: 'daily' }])

    expect(snapshots.length).toBeGreaterThan(0)
    expect(snapshots).toEqual(
      snapshots.map(() => ({
        specs: ['CMP'],
        colors: [symbolSpecIdentityKey({ symbol: 'CMP', market: 'CN' })],
      })),
    )
  })

  it('setSymbols no longer writes comparison specs', () => {
    const kernel = createKernel()

    kernel.actions.setSymbols([
      { symbol: 'MAIN', market: 'CN', period: 'daily' },
      { symbol: 'CMP', market: 'CN', period: 'daily' },
    ])

    expect(kernel.data.readonly.symbols.peek().map((spec) => spec.symbol)).toEqual([
      'MAIN',
      'CMP',
    ])
    expect(kernel.comparison.readonly.specs.peek()).toEqual([])
  })

  it('uses the comparison reference length for the viewport when comparison is active', () => {
    const kernel = createKernel()

    kernel.actions.setComparisonSpecs([{ symbol: 'CMP', market: 'CN', period: 'daily' }])
    kernel.comparison.actions.setReferenceLength(42)

    expect(kernel.dataLength$()).toBe(42)
  })
})
