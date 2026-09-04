import { describe, expect, it, vi } from 'vitest'

import { loadBuiltinIndicators } from '../../indicators/registerBuiltins'
import { getRegisteredIndicatorDefinition } from '../../indicators/indicatorDefinitionRegistry'
import { ChartStateKernel } from '../chartStateKernel'
import { ChartDataViewId, createModeState } from '../modeState'

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
      allowPan: true,
      allowZoom: true,
      allowVerticalScroll: false,
      allowRightAxisScale: false,
    })
  })

  it('keeps five-day timeshare as a distinct view with timeshare semantics', () => {
    const m = createModeState()

    m.actions.setDataView('fiveDayTimeShare', 'daily')

    expect(m.readonly.dataView.peek()).toBe('fiveDayTimeShare')
    expect(m.readonly.lastBarPeriod.peek()).toBe('daily')
    expect(m.readonly.effectivePrimaryRenderer.peek()).toBe('line')
    expect(m.readonly.interactionCapabilities.peek().allowPan).toBe(true)
    expect(m.readonly.interactionCapabilities.peek().allowZoom).toBe(true)
  })

  it('uses a line renderer while retaining K-line interactions in comparison view', () => {
    const m = createModeState()

    m.actions.setDataView('comparison')

    expect(m.readonly.effectivePrimaryRenderer.peek()).toBe('line')
    expect(m.readonly.interactionCapabilities.peek()).toEqual({
      allowPan: true,
      allowZoom: true,
      allowVerticalScroll: true,
      allowRightAxisScale: true,
    })
  })

  it('stores renderer preferences per view and falls back for unsupported combinations', () => {
    const m = createModeState()
    m.actions.setPrimaryRenderer('kline', 'ohlc-bar')
    m.actions.setPrimaryRenderer('timeshare', 'candlestick')

    expect(m.readonly.primaryRendererByView.peek()).toEqual({
      kline: 'ohlc-bar',
      timeshare: 'candlestick',
      fiveDayTimeShare: 'line',
      comparison: 'line',
    })
    expect(m.readonly.effectivePrimaryRenderer.peek()).toBe('ohlc-bar')

    m.actions.setDataView('timeshare')
    expect(m.readonly.effectivePrimaryRenderer.peek()).toBe('line')
  })

  it('publishes the data-view primary plugin through the kernel active renderer set', async () => {
    await loadBuiltinIndicators()
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

    expect(kernel.activeRenderers$.peek()).toEqual([
      { name: 'candle', layerId: 'plugin:candle' },
      { name: 'extremaMarkers', layerId: 'plugin:extremaMarkers' },
      { name: 'lastPriceLine', layerId: 'plugin:lastPriceLine' },
      { name: 'lastPriceLabelRegistrar', layerId: 'plugin:lastPriceLabelRegistrar' },
    ])
    expect(Object.isFrozen(kernel.activeRenderers$.peek())).toBe(true)

    kernel.actions.setDataView('timeshare')

    expect(kernel.indicator.readonly.instances.peek()).toEqual([
      {
        instanceId: 'mode:timeshare',
        indicatorId: 'timeShare',
        paneId: 'main',
        role: 'main',
        ordinal: 0,
        source: 'mode',
        params: {},
      },
    ])
    expect(kernel.activeRenderers$.peek()).toEqual([
      { name: 'timeShare', layerId: 'plugin:timeShare' },
    ])

    kernel.actions.setDataView('fiveDayTimeShare')

    expect(kernel.indicator.readonly.instances.peek()).toEqual([
      {
        instanceId: 'mode:five-day-timeshare',
        indicatorId: 'fiveDayTimeShare',
        paneId: 'main',
        role: 'main',
        ordinal: 0,
        source: 'mode',
        params: {},
      },
    ])
    expect(kernel.activeRenderers$.peek()).toEqual([
      { name: 'fiveDayTimeShare', layerId: 'plugin:fiveDayTimeShare' },
    ])

    kernel.actions.setDataView('comparison')

    expect(kernel.indicator.readonly.instances.peek()).toEqual([
      {
        instanceId: 'mode:comparison',
        indicatorId: 'comparisonLine',
        paneId: 'main',
        role: 'main',
        ordinal: 0,
        source: 'mode',
        params: {},
      },
    ])
    expect(kernel.activeRenderers$.peek()).toEqual([
      { name: 'comparisonLine', layerId: 'plugin:comparisonLine' },
    ])
  })

  it('restores and snapshots independent view workspaces without mode instances', async () => {
    await loadBuiltinIndicators()
    const initialViewWorkspaces = {
      kline: {
        instances: [
          {
            instanceId: 'main:BOLL',
            indicatorId: 'BOLL',
            paneId: 'main',
            role: 'main' as const,
            ordinal: 0,
            params: { period: 20 },
          },
        ],
        paneRatios: { main: 1 },
        paneSpecs: [{ id: 'main', ratio: 1, visible: true, role: 'price' as const }],
        paneScaleTypes: { main: 'log' as const },
      },
      timeshare: {
        instances: [],
        paneRatios: { main: 0.75, RSI_0: 0.25 },
        paneSpecs: [
          { id: 'main', ratio: 0.75, visible: true, role: 'price' as const },
          { id: 'RSI_0', ratio: 0.25, visible: true, role: 'indicator' as const },
        ],
        paneScaleTypes: { main: 'percent' as const },
      },
    }
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
      initialViewWorkspaces,
      scheduleDraw: () => undefined,
    })

    expect(kernel.snapshotViewWorkspaces()).toEqual(initialViewWorkspaces)
    kernel.actions.setDataView(ChartDataViewId.TimeShare)
    expect(kernel.pane.readonly.paneSpecs.peek().map((pane) => pane.id)).toEqual(['main', 'RSI_0'])
    expect(kernel.snapshotViewWorkspaces()).toEqual(initialViewWorkspaces)
  })

  it('uses an independent indicator workspace for timeshare', async () => {
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

    expect(kernel.visibleMainIndicatorIds$.peek()).toEqual(['ma', 'boll'])

    expect(kernel.activeRenderers$.peek()).toEqual([
      { name: 'candle', layerId: 'plugin:candle' },
      { name: 'extremaMarkers', layerId: 'plugin:extremaMarkers' },
      { name: 'lastPriceLine', layerId: 'plugin:lastPriceLine' },
      { name: 'lastPriceLabelRegistrar', layerId: 'plugin:lastPriceLabelRegistrar' },
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
    ])
    expect(kernel.visibleMainIndicatorIds$.peek()).toEqual([])
    expect(kernel.pane.readonly.paneSpecs.peek()).toEqual([
      { id: 'main', ratio: 1, visible: true, role: 'price' },
    ])

    kernel.actions.setDataView(ChartDataViewId.KLine)

    expect(kernel.activeRenderers$.peek()).toContainEqual({ name: 'boll', layerId: 'plugin:boll' })
  })
})
