import { describe, expect, it, vi } from 'vitest'

import { loadBuiltinIndicators } from '../../indicators/registerBuiltins'
import { getRegisteredIndicatorDefinition } from '../../indicators/indicatorDefinitionRegistry'
import { ChartStateKernel } from '../chartStateKernel'
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

  it('publishes the data-view primary plugin through the kernel active renderer set', () => {
    const kernel = new ChartStateKernel({
      initialOptions: {
        minKWidth: 1,
        maxKWidth: 50,
        zoomLevelCount: 20,
        bottomAxisHeight: 24,
        rightAxisWidth: 0,
        leftAxisWidth: 0,
        yPaddingPx: 20,
        panes: [{ id: 'main', ratio: 1, visible: true, role: 'price' }],
      },
      initialZoomLevel: 3,
      scheduleDraw: () => undefined,
    })

    expect(kernel.activeRenderers$.peek()).toEqual([{ name: 'candle', layerId: 'plugin:candle' }])
    expect(Object.isFrozen(kernel.activeRenderers$.peek())).toBe(true)

    kernel.actions.setDataView('timeshare')

    expect(kernel.indicator.readonly.instances.peek()).toEqual([
      {
        indicatorId: 'timeShare',
        paneId: 'main',
        role: 'main',
        source: 'mode',
        params: {},
      },
      {
        indicatorId: 'volume',
        paneId: 'timeshare_volume',
        role: 'sub',
        source: 'mode',
        params: {},
      },
    ])
    expect(kernel.pane.readonly.paneSpecs.peek()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'timeshare_volume', role: 'indicator' })]),
    )
    expect(kernel.pane.readonly.paneRatios.peek().timeshare_volume).toBeCloseTo(0.25)
    expect(kernel.activeRenderers$.peek()).toEqual([
      { name: 'timeShare', layerId: 'plugin:timeShare' },
    ])
  })

  it('includes only indicators supported by the active data view', async () => {
    await loadBuiltinIndicators()
    expect(
      getRegisteredIndicatorDefinition('RSI')?.getRendererName({
        paneId: 'sub_RSI',
        indicatorId: 'RSI',
      }),
    ).toBe('rsi_sub_RSI')
    const kernel = new ChartStateKernel({
      initialOptions: {
        minKWidth: 1,
        maxKWidth: 50,
        zoomLevelCount: 20,
        bottomAxisHeight: 24,
        rightAxisWidth: 0,
        leftAxisWidth: 0,
        yPaddingPx: 20,
        panes: [{ id: 'main', ratio: 1, visible: true, role: 'price' }],
      },
      initialZoomLevel: 3,
      scheduleDraw: () => undefined,
    })
    kernel.indicator.actions.upsertMain('MA', {})
    kernel.indicator.actions.upsertMain('BOLL', {})
    kernel.indicator.actions.upsertSub({ paneId: 'sub_RSI', indicatorId: 'RSI', params: {} })

    expect(kernel.activeRenderers$.peek()).toEqual([
      { name: 'candle', layerId: 'plugin:candle' },
      { name: 'ma', layerId: 'plugin:ma' },
      { name: 'boll', layerId: 'plugin:boll' },
      { name: 'mainIndicatorLegend', layerId: 'plugin:mainIndicatorLegend' },
      { name: 'rsi_sub_RSI', layerId: 'plugin:rsi_sub_RSI' },
      { name: 'rsiScale_sub_RSI', layerId: 'plugin:rsiScale_sub_RSI' },
      { name: 'paneTitle_sub_RSI', layerId: 'plugin:paneTitle_sub_RSI' },
    ])

    kernel.actions.setDataView('timeshare')

    expect(kernel.activeRenderers$.peek()).toEqual([
      { name: 'timeShare', layerId: 'plugin:timeShare' },
      { name: 'volume_timeshare_volume', layerId: 'plugin:volume_timeshare_volume' },
      { name: 'volumeScale_timeshare_volume', layerId: 'plugin:volumeScale_timeshare_volume' },
      { name: 'paneTitle_timeshare_volume', layerId: 'plugin:paneTitle_timeshare_volume' },
    ])
  })
})
