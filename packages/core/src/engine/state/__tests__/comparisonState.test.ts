import { describe, it, expect } from 'vitest'
import { createSignal } from '../../../foundation/reactivity/signal'
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

  it('derives immutable comparison specs from the symbols signal', () => {
    const symbols = createSignal([
      { symbol: 'MAIN', period: 'daily' },
      { symbol: 'CMP', period: 'weekly' },
    ])
    const m = createComparisonState({ symbols$: symbols })

    const specs = m.readonly.specs.peek()
    expect(specs).toEqual([{ symbol: 'CMP', period: 'weekly' }])
    expect(Object.isFrozen(specs)).toBe(true)
    expect(Object.isFrozen(specs[0])).toBe(true)

    symbols.set([{ symbol: 'NEXT', period: 'daily' }])
    expect(m.readonly.specs.peek()).toEqual([])
  })

  it('has no action that can write comparison specs directly', () => {
    const m = createComparisonState()
    expect('setSpecs' in m.actions).toBe(false)
    expect('replaceSpecs' in m.actions).toBe(false)
  })
})

describe('ChartStateKernel comparison selection transaction', () => {
  it('publishes symbols, derived specs, and colors without an intermediate snapshot', () => {
    const kernel = new ChartStateKernel({
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
    const snapshots: Array<{ symbols: string[]; specs: string[]; colors: string[] }> = []
    const capture = () => {
      snapshots.push({
        symbols: kernel.data.readonly.symbols.peek().map((spec) => spec.symbol),
        specs: kernel.comparison.readonly.specs.peek().map((spec) => spec.symbol),
        colors: [...kernel.comparison.readonly.colors.peek().keys()],
      })
    }
    kernel.data.readonly.symbols.subscribe(capture)
    kernel.comparison.readonly.specs.subscribe(capture)
    kernel.comparison.readonly.colors.subscribe(capture)

    kernel.actions.setSymbols([
      { symbol: 'MAIN', period: 'daily' },
      { symbol: 'CMP', period: 'daily' },
    ])

    expect(snapshots.length).toBeGreaterThan(0)
    expect(snapshots).toEqual(
      snapshots.map(() => ({ symbols: ['MAIN', 'CMP'], specs: ['CMP'], colors: ['CMP'] })),
    )
  })
})
