import { describe, expect, it, vi } from 'vitest'

import { createModeState } from '../modeState'

describe('modeState', () => {
  it('defaults to kline', () => {
    const m = createModeState()
    expect(m.readonly.chartMode.peek()).toBe('kline')
  })

  it('setChartMode updates and equal-skips', () => {
    const m = createModeState()
    const listener = vi.fn()
    m.readonly.chartMode.subscribe(listener)
    m.actions.setChartMode('timeshare')
    expect(m.readonly.chartMode.peek()).toBe('timeshare')
    m.actions.setChartMode('timeshare')
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
