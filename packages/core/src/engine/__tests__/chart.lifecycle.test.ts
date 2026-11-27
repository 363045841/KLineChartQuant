// @vitest-environment jsdom
/** 与行情数组注入无关的 Chart 生命周期、DPR、渲染调度与设置回归。 */
import { describe, expect, it, vi } from 'vitest'
import { Chart } from '@/core/chart/index'
import { PRICE_AXIS_RANGE_MODE } from '@/foundation/config/priceAxisRangeMode.js'
import { makePluginLayerId } from '@/foundation/plugin/impl/rendererLayerId'
import {
  registerEmptyPlot,
  registerPlotDefinition,
} from '../indicators/__tests__/helpers/plotIndicatorTestKit'
import { MAIN_PANE_ID } from '../pane/types'
import { PRICE_SERIES_AXIS_ID } from '../renderers/rendererIds.js'
import { createChartDom, ResizeObserverMock } from './helpers/chartDomTestKit'
import {
  createTestChartRuntime,
  defaultOptions,
  installChartTestHooks,
  mountChart,
  pointerEvent,
} from './helpers/chartLifecycleTestKit'
import { createMockRenderContext } from './helpers/renderTestKit'

describe('Chart lifecycle without a market selection', () => {
  installChartTestHooks()

  it('applies options without mutating a frozen caller object', async () => {
    const { chart } = mountChart()
    try {
      const patch = Object.freeze({ yPaddingPx: 7 })
      chart.updateOptions(patch)
      expect(patch).toEqual({ yPaddingPx: 7 })
      expect(chart.getOption().yPaddingPx).toBe(7)
    } finally {
      await chart.destroy()
    }
  })

  it('轴配置下发当前可用的范围口径', async () => {
    const { chart, definitions } = mountChart()
    registerEmptyPlot(definitions, 'range-axis-indicator')
    try {
      // 主价格轴承载行情：三档自动口径与手动都可用。
      expect(chart.axes.configuration(PRICE_SERIES_AXIS_ID).availableRangeModes).toEqual([
        PRICE_AXIS_RANGE_MODE.All,
        PRICE_AXIS_RANGE_MODE.Bars,
        PRICE_AXIS_RANGE_MODE.Ratio,
        PRICE_AXIS_RANGE_MODE.Manual,
      ])
      // 指标轴没有行情可拟合：只有全并与手动。
      const paneId = chart.panes.addPane(MAIN_PANE_ID, 'below')!
      const instanceId = chart.indicators.add('range-axis-indicator')!
      chart.indicators.move(instanceId, { kind: 'pane', paneId })
      expect(
        chart.axes.configuration(chart.axes.bindingFor(instanceId).axisId).availableRangeModes,
      ).toEqual([PRICE_AXIS_RANGE_MODE.All, PRICE_AXIS_RANGE_MODE.Manual])
    } finally {
      await chart.destroy()
    }
  })

  it('resets the time view through the single frame commit before adapting the price axis', async () => {
    const { chart } = mountChart()
    try {
      const initialZoom = chart.kernel.zoom.readonly.zoomLevel.peek()
      chart.zoom.toLevel(initialZoom + 2)
      const frame = vi.spyOn(chart['zoomController'], 'frame')
      const price = vi.spyOn(chart.axes, 'resetRange')
      chart.resetChart()
      expect(chart.kernel.zoom.readonly.zoomLevel.peek()).toBeCloseTo(initialZoom, 5)
      expect(frame).toHaveBeenCalledOnce()
      expect(price).toHaveBeenCalledWith(PRICE_SERIES_AXIS_ID)
      expect(frame.mock.invocationCallOrder[0]).toBeLessThan(price.mock.invocationCallOrder[0]!)
    } finally {
      await chart.destroy()
    }
  })

  it('checks history only after the last pinch pointer is lifted, not on leave or render', async () => {
    const dom = createChartDom(1000, 600)
    dom.container.setPointerCapture = () => {}
    dom.container.hasPointerCapture = () => false
    dom.container.releasePointerCapture = () => {}
    const chart = new Chart(dom, defaultOptions, createTestChartRuntime())
    try {
      chart.resize()
      const check = vi.spyOn(chart, 'checkVisibleRangeGap').mockImplementation(() => {})
      chart.handlePointerEvent(pointerEvent('pointerdown', dom.container))
      chart.handlePointerEvent(
        pointerEvent('pointerdown', dom.container, {
          clientX: 200,
          isPrimary: false,
          pointerId: 2,
        }),
      )
      chart.handlePointerEvent(pointerEvent('pointerleave', dom.container))
      chart.draw()
      expect(check).not.toHaveBeenCalled()
      chart.handlePointerEvent(pointerEvent('pointerup', dom.container))
      expect(check).not.toHaveBeenCalled()
      chart.handlePointerEvent(
        pointerEvent('pointerup', dom.container, { isPrimary: false, pointerId: 2 }),
      )
      expect(check).toHaveBeenCalledOnce()
    } finally {
      await chart.destroy()
    }
  })

  it('ignores non-primary mouse buttons so a context menu never starts a pan session', async () => {
    const dom = createChartDom(1000, 600)
    dom.container.setPointerCapture = () => {}
    dom.container.hasPointerCapture = () => false
    dom.container.releasePointerCapture = () => {}
    const chart = new Chart(dom, defaultOptions, createTestChartRuntime())
    try {
      chart.resize()
      chart.handlePointerEvent(
        pointerEvent('pointerdown', dom.container, { pointerType: 'mouse', button: 2 }),
      )
      expect(chart.interactionState.peek().isDragging).toBe(false)
      chart.handlePointerEvent(
        pointerEvent('pointerdown', dom.container, { pointerType: 'mouse', button: 0 }),
      )
      expect(chart.interactionState.peek().isDragging).toBe(true)
    } finally {
      await chart.destroy()
    }
  })

  it('checks after smooth wheel zoom settles, but never during a held pointer', async () => {
    const frames = new Map<number, FrameRequestCallback>()
    let frameId = 0
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++frameId, callback)
      return frameId
    })
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id)
    })
    const dom = createChartDom(1000, 600)
    dom.container.setPointerCapture = () => {}
    dom.container.hasPointerCapture = () => false
    dom.container.releasePointerCapture = () => {}
    const chart = new Chart(dom, defaultOptions, createTestChartRuntime())
    try {
      chart.resize()
      const check = vi.spyOn(chart, 'checkVisibleRangeGap').mockImplementation(() => {})
      chart.handlePointerEvent(pointerEvent('pointerdown', dom.container, { pointerType: 'mouse' }))
      const wheel = new WheelEvent('wheel', { deltaY: -100, clientX: 100 })
      chart.handleWheelEvent(wheel)
      chart.draw()
      expect(check).not.toHaveBeenCalled()
      chart.handlePointerEvent(pointerEvent('pointerup', dom.container, { pointerType: 'mouse' }))
      expect(check).not.toHaveBeenCalled()
      chart.handleWheelEvent(wheel)
      expect(check).not.toHaveBeenCalled()
      const callbacks = [...frames.values()]
      frames.clear()
      for (const callback of callbacks) callback(performance.now() + 1000)
      expect(check).not.toHaveBeenCalled()
      const completion = [...frames.values()]
      frames.clear()
      for (const callback of completion) callback(performance.now() + 1016)
      expect(check).toHaveBeenCalledOnce()
    } finally {
      await chart.destroy()
    }
  })

  it('registers the latest price layers and follows the data view', async () => {
    const { chart } = mountChart()
    try {
      const scene = chart['renderer'].getScene()
      expect(chart.kernel.indicator.readonly.instances.peek()).toEqual([])
      expect(chart.legend.list()).toEqual([])
      for (const name of ['lastPriceLine']) {
        expect(chart.getRenderer(makePluginLayerId(name))).toBeDefined()
        expect(scene.getLayer(`plugin:${name}`)).toBeDefined()
        expect(chart.getRenderer(makePluginLayerId(name))?.role).toBe('overlay')
      }
      chart.kernel.actions.setDataView('timeshare')
      expect(scene.getLayer('plugin:lastPriceLine')?.visible).toBe(false)
      chart.kernel.actions.setDataView('kline')
      expect(scene.getLayer('plugin:lastPriceLine')?.visible).toBe(true)
    } finally {
      await chart.destroy()
    }
  })

  it('falls back to default observe when device-pixel-content-box observe fails', async () => {
    ResizeObserverMock.failWithDevicePixelBox = true
    const { chart } = mountChart()
    try {
      const observer = ResizeObserverMock.instances[0]!
      expect(observer.observe).toHaveBeenCalledTimes(2)
      expect(observer.observe).toHaveBeenNthCalledWith(1, chart.getDom().container, {
        box: 'device-pixel-content-box',
      })
      expect(observer.observe).toHaveBeenNthCalledWith(2, chart.getDom().container)
    } finally {
      await chart.destroy()
    }
  })

  it.each([
    { name: 'precise device-pixel box', ratio: 1, devicePixel: [2000, 1200], expected: 2 },
    {
      name: 'rounded window ratio',
      ratio: 1.234,
      devicePixel: undefined,
      expected: Math.round(1.234 * 64) / 64,
    },
    { name: 'minimum ratio', ratio: 0.5, devicePixel: undefined, expected: 1 },
  ])('derives DPR from $name', async ({ ratio, devicePixel, expected }) => {
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      writable: true,
      value: ratio,
    })
    const { chart } = mountChart()
    try {
      ResizeObserverMock.instances[0]!.emit({
        contentRect: DOMRect.fromRect({ width: 1000, height: 600 }),
        contentBoxSize: [{ inlineSize: 1000, blockSize: 600 }],
        ...(devicePixel
          ? {
              devicePixelContentBoxSize: [
                { inlineSize: devicePixel[0]!, blockSize: devicePixel[1]! },
              ],
            }
          : {}),
      })
      expect(chart.getCurrentDpr()).toBe(expected)
    } finally {
      await chart.destroy()
    }
  })

  it('reduces viewport DPR when requested pixels exceed MAX_CANVAS_PIXELS', async () => {
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      writable: true,
      value: 3,
    })
    const { chart } = mountChart({ width: 6000, height: 4000 })
    try {
      chart.resize()
      expect(chart.getViewport()).not.toBeNull()
      expect(chart.getViewport()!.dpr).toBeLessThan(3)
    } finally {
      await chart.destroy()
    }
  })

  it('disconnects ResizeObserver on destroy', async () => {
    const { chart } = mountChart()
    const observer = ResizeObserverMock.instances[0]!
    await chart.destroy()
    expect(observer.disconnect).toHaveBeenCalledTimes(1)
  })

  it('does not emit viewport change on draw when viewport is unchanged', async () => {
    const { chart } = mountChart()
    try {
      const onViewportChange = vi.fn()
      chart.viewport.subscribe(onViewportChange)
      chart.draw()
      chart.draw()
      expect(onViewportChange).not.toHaveBeenCalled()
    } finally {
      await chart.destroy()
    }
  })

  it('does not schedule redraw for identical render state', async () => {
    const { chart } = mountChart()
    try {
      const schedule = vi.spyOn(chart, 'scheduleDraw')
      chart.zoom.toLevel(2)
      chart.zoom.toLevel(2)
      expect(schedule).toHaveBeenCalledOnce()
    } finally {
      await chart.destroy()
    }
  })

  it.each([300, 800])(
    'lays out OHLC and indicator titles together at pane width %s',
    async (paneWidth) => {
      const { chart, definitions } = mountChart()
      const definitionId = `title-layout-${paneWidth}`
      registerPlotDefinition(definitions, {
        id: definitionId,
        name: definitionId,
        source: 'script',
        position: 'main',
        inputs: {},
        compute: () => ({ plots: [], fills: [] }),
      })
      try {
        const instanceId = chart.indicators.add(definitionId)!
        chart.legend.create({
          kind: 'custom',
          id: 'note',
          paneId: MAIN_PANE_ID,
          texts: [{ text: 'note', color: '' }],
        })
        const context = createMockRenderContext({
          data: [{ timestamp: 1000, open: 10, high: 12, low: 9, close: 11, volume: 100 }],
          dataView: 'kline',
          paneWidth,
          crosshairIndex: 0,
        })
        chart.legend.projectFrame([context])
        const rows = chart.legend.rows.peek()
        const quoteCount = paneWidth === 300 ? 2 : 1
        expect(
          rows.slice(0, quoteCount).flatMap((row) => row.texts.map((text) => text.text)),
        ).toEqual(expect.arrayContaining(['O 10.00', 'H 12.00', 'L 9.00', 'C 11.00']))
        expect(rows[quoteCount]!.key).toBe(instanceId)
        expect(rows[quoteCount + 1]!.key).toBe('custom:note')
        for (let index = 1; index < rows.length; index++)
          expect(rows[index]!.y).toBeGreaterThanOrEqual(
            rows[index - 1]!.y + rows[index - 1]!.height,
          )
        expect(chart.legend.context.peek()!.rows).toEqual(rows)
        expect(chart.indicators.update(instanceId, { hidden: true })).toBe(true)
        chart.legend.projectFrame([context])
        expect(chart.legend.rows.peek().map((row) => row.y)).toEqual(rows.map((row) => row.y))
      } finally {
        await chart.destroy()
      }
    },
  )

  it('clears stale canvases and cached geometry when switching data views', async () => {
    const { chart } = mountChart()
    try {
      const renderer = chart['renderer']
      const clearCanvases = vi.spyOn(renderer, 'clearAllCanvases')
      const clearFrame = vi.spyOn(renderer, 'clearCachedFrame')
      const clearLegend = vi.spyOn(chart.legend, 'clearFrame')
      chart.setActiveMode(chart['_timeShareMode'])
      expect(clearCanvases).toHaveBeenCalledOnce()
      expect(clearFrame).toHaveBeenCalledOnce()
      expect(clearLegend).toHaveBeenCalled()
      expect(chart.legend.context.peek()).toBeNull()
    } finally {
      await chart.destroy()
    }
  })

  it('merges settings patches in kernel SSOT and exposes them to renderer', async () => {
    const { chart } = mountChart()
    try {
      chart.updateSettings({ showGridLines: false })
      chart.updateSettings({ mainRightAxisTypeSetting: 'log' })
      expect(chart.kernel.settings.readonly.settings.peek().showGridLines).toBe(false)
      expect(chart.kernel.settings.readonly.settings.peek().mainRightAxisTypeSetting).toBe('log')
      expect(chart['renderer'].getSettings().showGridLines).toBe(false)
      expect(chart['renderer'].getSettings().mainRightAxisTypeSetting).toBe('log')
    } finally {
      await chart.destroy()
    }
  })

  it('restores layout settings into the actual renderer and cache resources', async () => {
    const { chart } = mountChart()
    try {
      const switchBackend = vi.spyOn(chart['rendererHost'], 'switchTo')
      const originalBackend = chart.kernel.settings.readonly.settings.peek().rendererBackend
      const document = chart.kernel.exportLayout()
      chart.kernel.applyLayout({
        ...document,
        settings: {
          ...document.settings,
          rendererBackend: originalBackend === 'canvas' ? 'webgl' : 'canvas',
          marketDataCacheMaxMiB: 200,
        },
      })
      expect(switchBackend).toHaveBeenCalledWith(originalBackend === 'canvas' ? 'webgl' : 'canvas')
      expect(chart.getMarketData().stats.peek().maxBytes).toBe(200 * 1024 * 1024)
      chart.kernel.applyLayout({ ...document, settings: {} })
      expect(chart.getMarketData().stats.peek().maxBytes).toBe(50 * 1024 * 1024)
      expect(chart.kernel.settings.readonly.settings.peek().rendererBackend).toBe(originalBackend)
    } finally {
      await chart.destroy()
    }
  })
})
