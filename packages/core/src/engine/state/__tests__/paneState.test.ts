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
})
