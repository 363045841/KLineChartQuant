import { describe, it, expect } from 'vitest'
import { createPaneState } from '../paneState'

describe('paneState', () => {
  it('commitLayout publishes ratios and specs atomically', () => {
    const m = createPaneState()
    const snaps: Array<{ ratios: number; specs: number }> = []
    m.readonly.paneRatios.subscribe(() => {
      snaps.push({
        ratios: Object.keys(m.readonly.paneRatios.peek()).length,
        specs: m.readonly.paneSpecs.peek().length,
      })
    })
    m.readonly.paneSpecs.subscribe(() => {
      snaps.push({
        ratios: Object.keys(m.readonly.paneRatios.peek()).length,
        specs: m.readonly.paneSpecs.peek().length,
      })
    })

    m.actions.commitLayout({ main: 1 }, [{ id: 'main', ratio: 1, role: 'price' }])

    expect(m.readonly.paneRatios()).toEqual({ main: 1 })
    expect(m.readonly.paneSpecs()).toEqual([{ id: 'main', ratio: 1, role: 'price' }])
    for (const s of snaps) {
      expect(s).toEqual({ ratios: 1, specs: 1 })
    }
  })

  it('commitLayout copies ratios and specs', () => {
    const m = createPaneState()
    const ratios = { main: 1 }
    const specs = [{ id: 'main', ratio: 1, role: 'price' as const }]
    m.actions.commitLayout(ratios, specs)
    ratios.main = 0.5
    specs[0]!.ratio = 0.5
    expect(m.readonly.paneRatios().main).toBe(1)
    expect(m.readonly.paneSpecs()[0]?.ratio).toBe(1)
  })

  it('commitLayout does not invent scale types for new panes', () => {
    const m = createPaneState()
    m.actions.commitLayout({ main: 1 }, [{ id: 'main', ratio: 1, role: 'price' }])
    expect(m.readonly.paneScaleTypes.peek().has('main')).toBe(false)
  })

  it('setPaneScaleType / replacePaneScaleTypes / removePaneScaleType', () => {
    const m = createPaneState()
    m.actions.commitLayout({ main: 1, MACD: 1 }, [
      { id: 'main', ratio: 1, role: 'price' },
      { id: 'MACD', ratio: 1, role: 'indicator' },
    ])
    m.actions.setPaneScaleType('main', 'log')
    expect(m.readonly.paneScaleTypes.peek().get('main')).toBe('log')
    m.actions.replacePaneScaleTypes(new Map([['main', 'percent']]))
    expect(m.readonly.paneScaleTypes.peek().get('main')).toBe('percent')
    expect(m.readonly.paneScaleTypes.peek().has('MACD')).toBe(false)
    m.actions.removePaneScaleType('main')
    expect(m.readonly.paneScaleTypes.peek().has('main')).toBe(false)
  })

  it('commitLayout preserves existing scale types for surviving panes only', () => {
    const m = createPaneState()
    m.actions.commitLayout({ main: 1 }, [{ id: 'main', ratio: 1, role: 'price' }])
    m.actions.setPaneScaleType('main', 'log')
    m.actions.commitLayout({ main: 0.75, RSI: 0.25 }, [
      { id: 'main', ratio: 0.75, role: 'price' },
      { id: 'RSI', ratio: 0.25, role: 'indicator' },
    ])
    expect(m.readonly.paneScaleTypes.peek().get('main')).toBe('log')
    expect(m.readonly.paneScaleTypes.peek().has('RSI')).toBe(false)
  })
})
