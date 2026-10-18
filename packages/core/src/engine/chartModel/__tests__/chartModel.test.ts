import { describe, expect, it, vi } from 'vitest'
import { loadBuiltinIndicators } from '../../indicators/registerBuiltins'
import { createTestChartStateKernel } from '../../state/__tests__/helpers/createTestChartStateKernel'
import { createChartModel } from '../index'

describe('chartModel', () => {
  it('derives the kline primary renderer from the persisted shape setting', () => {
    const kernel = createTestChartStateKernel()
    const restored = createTestChartStateKernel()
    try {
      kernel.settings.actions.patch({ klineShape: 'hollow-candlestick' })
      // 形态和主序列模型共用 settings，切换数据视图不覆盖 K 线选择。
      expect(kernel.mode.readonly.effectivePrimaryRenderer.peek()).toBe('hollow-candlestick')
      kernel.actions.setDataView('timeshare')
      expect(kernel.mode.readonly.effectivePrimaryRenderer.peek()).toBe('line')
      kernel.actions.setDataView('kline')
      expect(kernel.mode.readonly.effectivePrimaryRenderer.peek()).toBe('hollow-candlestick')
      const layout = kernel.exportLayout()
      expect(layout.settings?.klineShape).toBe('hollow-candlestick')
      restored.applyLayout(layout)
      expect(restored.settings.readonly.settings.peek().klineShape).toBe('hollow-candlestick')
      expect(restored.mode.readonly.effectivePrimaryRenderer.peek()).toBe('hollow-candlestick')
      restored.settings.actions.patch({ klineShape: 'candlestick' })
      expect(restored.mode.readonly.effectivePrimaryRenderer.peek()).toBe('candlestick')
    } finally {
      kernel.dispose()
      restored.dispose()
    }
  })
  it('defaults to kline', () => {
    const m = createChartModel()
    expect(m.readonly.chartMode.peek()).toBe('kline')
    expect(m.readonly.dataView.peek()).toBe('kline')
    expect(m.readonly.lastBarPeriod.peek()).toBe('daily')
    expect(m.readonly.effectivePrimaryRenderer.peek()).toBe('candlestick')
    expect(m.readonly.interactionCapabilities.peek().allowZoom).toBe(true)
  })

  it('setChartMode updates and equal-skips', () => {
    const m = createChartModel()
    const listener = vi.fn()
    m.readonly.chartMode.subscribe(listener)
    m.actions.setChartMode('timeshare')
    expect(m.readonly.chartMode.peek()).toBe('timeshare')
    m.actions.setChartMode('timeshare')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('derives the effective renderer and interaction capabilities from dataView', () => {
    const m = createChartModel()

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

  it('keeps five-day timeshare as a distinct view with timeshare semantics', () => {
    const m = createChartModel()

    m.actions.setDataView('fiveDayTimeShare', 'daily')

    expect(m.readonly.dataView.peek()).toBe('fiveDayTimeShare')
    expect(m.readonly.lastBarPeriod.peek()).toBe('daily')
    expect(m.readonly.effectivePrimaryRenderer.peek()).toBe('line')
    expect(m.readonly.interactionCapabilities.peek().allowPan).toBe(true)
    expect(m.readonly.interactionCapabilities.peek().allowZoom).toBe(true)
  })

  it('derives the primary renderer from the active view declaration', () => {
    const m = createChartModel()

    // 无设置覆盖时采用数据视图的主序列默认画法。
    expect(m.readonly.primaryRendererByView.peek()).toEqual({
      kline: 'candlestick',
      timeshare: 'line',
      fiveDayTimeShare: 'line',
    })
    expect(m.readonly.effectivePrimaryRenderer.peek()).toBe('candlestick')

    m.actions.setDataView('timeshare')
    expect(m.readonly.effectivePrimaryRenderer.peek()).toBe('line')
  })

  it('publishes the data-view primary plugin through the kernel active renderer set', async () => {
    await loadBuiltinIndicators()
    const kernel = createTestChartStateKernel()

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

    kernel.actions.setDataView('kline')
    const before = kernel.activeRenderers$.peek()
    kernel.actions.setComparisonSpecs([{ symbol: 'CMP', market: 'CN', period: 'daily' }])
    expect(kernel.activeRenderers$.peek()).toEqual([
      ...before,
      { name: 'comparisonLine', layerId: 'plugin:comparisonLine' },
    ])
    expect(kernel.mode.readonly.effectivePrimaryRenderer.peek()).toBe('candlestick')
    kernel.actions.setDataView('timeshare')
    expect(kernel.activeRenderers$.peek()).not.toContainEqual({
      name: 'comparisonLine',
      layerId: 'plugin:comparisonLine',
    })
  })
})
