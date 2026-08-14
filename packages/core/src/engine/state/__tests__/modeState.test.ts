import { describe, expect, it, vi } from 'vitest'

import { createModeState } from '../modeState'

describe('modeState', () => {
  it('defaults to kline', () => {
    const m = createModeState()
    expect(m.readonly.chartMode.peek()).toBe('kline')
    expect(m.readonly.dataView.peek()).toBe('kline')
    expect(m.readonly.lastBarPeriod.peek()).toBe('daily')
    expect(m.readonly.effectivePrimaryRenderer.peek()).toBe('candlestick')
    expect(m.readonly.interactionCapabilities.peek().allowZoom).toBe(true)
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

  it('derives the effective renderer and interaction capabilities from dataView', () => {
    const m = createModeState()

    m.actions.setDataView('timeshare', '60min')

    expect(m.readonly.lastBarPeriod.peek()).toBe('60min')
    expect(m.readonly.effectivePrimaryRenderer.peek()).toBe('line')
    expect(m.readonly.interactionCapabilities.peek()).toEqual({
      allowPan: false,
      allowZoom: false,
      allowVerticalScroll: false,
      allowRightAxisScale: false,
    })
  })

  it('stores renderer preferences per view and falls back for unsupported combinations', () => {
    const m = createModeState()
    m.actions.setPrimaryRenderer('kline', 'ohlc-bar')
    m.actions.setPrimaryRenderer('timeshare', 'candlestick')

    expect(m.readonly.primaryRendererByView.peek()).toEqual({
      kline: 'ohlc-bar',
      timeshare: 'candlestick',
    })
    expect(m.readonly.effectivePrimaryRenderer.peek()).toBe('ohlc-bar')

    m.actions.setDataView('timeshare')
    expect(m.readonly.effectivePrimaryRenderer.peek()).toBe('line')
  })
})
