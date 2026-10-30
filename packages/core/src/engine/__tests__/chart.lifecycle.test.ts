// @vitest-environment jsdom
/** 与行情数组注入无关的 Chart 生命周期、DPR、设置和文档回归。 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Chart, type ChartOptions } from '@/core/chart/index'
import { createChartDom, installChartDomStubs, ResizeObserverMock } from './helpers/chartDomTestKit'
import { makePluginLayerId } from '@/foundation/plugin/impl/rendererLayerId'
import { ScaleType } from '@/foundation/types/scaleType'
import { createDrawingAdapter, createTrendLine } from '../drawing/__tests__/helpers/drawingTestKit'
import { DrawingInteractionController } from '../drawing/index'
import { loadBuiltinIndicators } from '../indicators/registerBuiltins'
import { registerPlotIndicator, updatePlotIndicator } from '../indicators/registerPlotIndicator'
import { resolveIndicatorLayerId } from '../indicators/indicatorDefinitionRegistry'
import { LAYOUT_DOCUMENT_VERSION } from '../layout/types'
import { MAIN_PANE_ID } from '../pane/types'

const defaultOptions: ChartOptions = {
  kWidth: 10, kGap: 2, yPaddingPx: 0, rightAxisWidth: 0, leftAxisWidth: 0,
  bottomAxisHeight: 24, minKWidth: 2, maxKWidth: 50,
  panes: [{ id: 'main', ratio: 1 }], priceLabelWidth: 60,
}

/** 创建不选择行情的图表；这些用例只验证独立于行情的职责。 */
function mountChart(width = 1000, height = 600, runtime?: ConstructorParameters<typeof Chart>[2]): Chart {
  return new Chart(createChartDom(width, height), defaultOptions, runtime)
}

/** 通过真实 DOM 事件提供完整的 PointerEvent 结构。 */
function pointerEvent(type: string, target: HTMLElement, overrides: PointerEventInit = {}): PointerEvent {
  const event = new PointerEvent(type, { clientX: 100, clientY: 40, isPrimary: true, pointerType: 'touch', pointerId: 1, ...overrides })
  Object.defineProperty(event, 'target', { value: target })
  return event
}

describe('Chart lifecycle without a market selection', () => {
  let restoreChartDomStubs: () => void
  beforeAll(loadBuiltinIndicators)
  beforeEach(() => { restoreChartDomStubs = installChartDomStubs() })
  afterEach(() => { restoreChartDomStubs(); vi.restoreAllMocks() })

  it('filters options without mutating a frozen caller object', async () => {
    const chart = mountChart()
    try {
      const patch = Object.freeze({ kWidth: 99, kGap: 98, yPaddingPx: 7 })
      chart.updateOptions(patch)
      expect(patch).toEqual({ kWidth: 99, kGap: 98, yPaddingPx: 7 })
      expect(chart.getOption().yPaddingPx).toBe(7)
      expect(chart.kernel.zoom.readonly.kWidth.peek()).not.toBe(99)
    } finally { await chart.destroy() }
  })

  it('checks history only after the last pinch pointer is lifted, not on leave or render', async () => {
    const dom = createChartDom(1000, 600)
    dom.container.setPointerCapture = () => {}
    dom.container.hasPointerCapture = () => false
    dom.container.releasePointerCapture = () => {}
    const chart = new Chart(dom, defaultOptions)
    try {
      chart.resize()
      const check = vi.spyOn(chart, 'checkVisibleRangeGap').mockImplementation(() => {})
      chart.handlePointerEvent(pointerEvent('pointerdown', dom.container))
      chart.handlePointerEvent(pointerEvent('pointerdown', dom.container, { clientX: 200, isPrimary: false, pointerId: 2 }))
      chart.handlePointerEvent(pointerEvent('pointerleave', dom.container))
      chart.draw()
      expect(check).not.toHaveBeenCalled()
      chart.handlePointerEvent(pointerEvent('pointerup', dom.container))
      expect(check).not.toHaveBeenCalled()
      chart.handlePointerEvent(pointerEvent('pointerup', dom.container, { isPrimary: false, pointerId: 2 }))
      expect(check).toHaveBeenCalledOnce()
    } finally { await chart.destroy() }
  })

  it('checks after smooth wheel zoom settles, but never during a held pointer', async () => {
    const frames = new Map<number, FrameRequestCallback>()
    let frameId = 0
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => { frames.set(++frameId, callback); return frameId })
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => { frames.delete(id) })
    const dom = createChartDom(1000, 600)
    dom.container.setPointerCapture = () => {}
    dom.container.hasPointerCapture = () => false
    dom.container.releasePointerCapture = () => {}
    const chart = new Chart(dom, defaultOptions)
    try {
      chart.resize()
      const check = vi.spyOn(chart, 'checkVisibleRangeGap').mockImplementation(() => {})
      chart.handlePointerEvent(pointerEvent('pointerdown', dom.container, { pointerType: 'mouse' }))
      const wheel = new WheelEvent('wheel', { deltaY: -1, clientX: 100 })
      chart.handleWheelEvent(wheel)
      chart.draw()
      expect(check).not.toHaveBeenCalled()
      chart.handlePointerEvent(pointerEvent('pointerup', dom.container, { pointerType: 'mouse' }))
      expect(check).not.toHaveBeenCalled()
      chart.handleWheelEvent(wheel)
      expect(check).not.toHaveBeenCalled()
      const callbacks = [...frames.values()]
      frames.clear()
      for (const callback of callbacks) callback(performance.now() + 200)
      expect(check).toHaveBeenCalledOnce()
    } finally { await chart.destroy() }
  })

  it('registers the latest price layers and follows the data view', async () => {
    const chart = mountChart()
    try {
      const scene = chart['renderer'].getScene()
      for (const name of ['lastPriceLine', 'lastPriceLabelRegistrar']) {
        expect(chart.getRenderer(makePluginLayerId(name))).toBeDefined()
        expect(scene.getLayer(`plugin:${name}`)).toBeDefined()
        expect(chart.getRenderer(makePluginLayerId(name))?.role).toBe('overlay')
      }
      chart.kernel.actions.setDataView('timeshare')
      expect(scene.getLayer('plugin:lastPriceLine')?.visible).toBe(false)
      expect(scene.getLayer('plugin:lastPriceLabelRegistrar')?.visible).toBe(false)
      chart.kernel.actions.setDataView('kline')
      expect(scene.getLayer('plugin:lastPriceLine')?.visible).toBe(true)
      expect(scene.getLayer('plugin:lastPriceLabelRegistrar')?.visible).toBe(true)
    } finally { await chart.destroy() }
  })

  it('falls back to default observe when device-pixel-content-box observe fails', async () => {
    ResizeObserverMock.failWithDevicePixelBox = true
    const chart = mountChart()
    try {
      const observer = ResizeObserverMock.instances[0]!
      expect(observer.observe).toHaveBeenCalledTimes(2)
      expect(observer.observe).toHaveBeenNthCalledWith(1, chart.getDom().container, { box: 'device-pixel-content-box' })
      expect(observer.observe).toHaveBeenNthCalledWith(2, chart.getDom().container)
    } finally { await chart.destroy() }
  })

  it.each([
    { name: 'precise device-pixel box', ratio: 1, devicePixel: [2000, 1200], expected: 2 },
    { name: 'rounded window ratio', ratio: 1.234, devicePixel: undefined, expected: Math.round(1.234 * 64) / 64 },
    { name: 'minimum ratio', ratio: 0.5, devicePixel: undefined, expected: 1 },
  ])('derives DPR from $name', async ({ ratio, devicePixel, expected }) => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, writable: true, value: ratio })
    const chart = mountChart()
    try {
      ResizeObserverMock.instances[0]!.emit({
        contentRect: DOMRect.fromRect({ width: 1000, height: 600 }),
        contentBoxSize: [{ inlineSize: 1000, blockSize: 600 }],
        ...(devicePixel ? { devicePixelContentBoxSize: [{ inlineSize: devicePixel[0]!, blockSize: devicePixel[1]! }] } : {}),
      })
      expect(chart.getCurrentDpr()).toBe(expected)
    } finally { await chart.destroy() }
  })

  it('reduces viewport DPR when requested pixels exceed MAX_CANVAS_PIXELS', async () => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, writable: true, value: 3 })
    const chart = mountChart(6000, 4000)
    try {
      chart.resize()
      expect(chart.getViewport()).not.toBeNull()
      expect(chart.getViewport()!.dpr).toBeLessThan(3)
    } finally { await chart.destroy() }
  })

  it('disconnects ResizeObserver on destroy', async () => {
    const chart = mountChart()
    const observer = ResizeObserverMock.instances[0]!
    await chart.destroy()
    expect(observer.disconnect).toHaveBeenCalledTimes(1)
  })

  it('does not emit viewport change on draw when viewport is unchanged', async () => {
    const chart = mountChart()
    try {
      const onViewportChange = vi.fn()
      chart.viewport.subscribe(onViewportChange)
      chart.draw()
      chart.draw()
      expect(onViewportChange).not.toHaveBeenCalled()
    } finally { await chart.destroy() }
  })

  it('does not schedule redraw for identical render state', async () => {
    const chart = mountChart()
    try {
      const schedule = vi.spyOn(chart, 'scheduleDraw')
      chart.zoom.toLevel(2)
      chart.zoom.toLevel(2)
      expect(schedule).toHaveBeenCalledOnce()
    } finally { await chart.destroy() }
  })

  it('routes drawings through kernel for store projection', async () => {
    const chart = mountChart()
    try {
      const store = chart.drawing.getStore()
      const schedule = vi.spyOn(chart, 'scheduleDraw')
      chart.drawing.setDrawings([createTrendLine('d1')])
      expect(chart.drawing.drawings.peek().map((drawing) => drawing.id)).toEqual(['d1'])
      expect(store.getAll().map((drawing) => drawing.id)).toEqual(['d1'])
      expect(schedule).toHaveBeenCalled()
      chart.drawing.setSelectedIds(['d1'])
      expect(store.getSelectedIds()).toEqual(['d1'])
      schedule.mockClear()
      chart.drawing.setDrawings([])
      expect(store.getAll()).toEqual([])
      expect(store.getSelectedIds()).toEqual([])
      expect(schedule).toHaveBeenCalled()
    } finally { await chart.destroy() }
  })

  it('projectState does not commitLayout back to kernel', async () => {
    const chart = mountChart()
    try {
      const commit = vi.spyOn(chart.kernel.pane.actions, 'commitLayout')
      commit.mockClear()
      chart['layoutManager'].projectState([
        { id: 'main', ratio: 0.7, role: 'price', visible: true },
        { id: 'MACD_0', ratio: 0.3, role: 'indicator', visible: true },
      ], { main: 0.7, MACD_0: 0.3 })
      expect(commit).not.toHaveBeenCalled()
    } finally { await chart.destroy() }
  })

  it('restores all panes before definitions arrive and keeps geometry and configuration stable as content loads', async () => {
    const chart = mountChart(1000, 1000)
    try {
      const document = chart.kernel.createLayout()
      const paneSpecs = [
        { id: 'main', ratio: 0.6 },
        { id: 'late-pane-a', ratio: 0.25 },
        { id: 'late-pane-b', ratio: 0.15 },
      ]
      chart.kernel.applyLayout({ ...document, workspaces: {
        ...document.workspaces,
        kline: {
          instances: paneSpecs.slice(1).map((pane, index) => ({
            instanceId: `late-instance-${index}`,
            indicatorId: pane.id,
            paneId: pane.id,
            role: 'sub',
            ordinal: 0,
            params: {},
          })),
          paneSpecs,
          paneScaleTypes: { 'late-pane-a': 'log' },
        },
      } })
      chart.draw()
      const baseline = chart.kernel.exportLayout().workspaces
      const panes = chart.getPaneRenderers().map((renderer) => renderer.getPane())
      const heights = panes.map((pane) => pane.height)
      expect(panes.map((pane) => pane.id)).toEqual(paneSpecs.map((pane) => pane.id))
      expect(chart.indicators.subPanes.peek()).toHaveLength(2)
      expect(heights[1]! / heights[2]!).toBeCloseTo(0.25 / 0.15, 1)
      const commit = vi.spyOn(chart.kernel.pane.actions, 'commitLayout')

      for (const pane of paneSpecs.slice(1)) {
        registerPlotIndicator({
          id: pane.id, name: pane.id, source: 'script', inputs: {},
          compute: () => ({ plots: [], fills: [] }),
        })
        chart.draw()
        expect(chart.getRenderer(resolveIndicatorLayerId(pane.id, pane.id))).toBeDefined()
        chart.getPaneRenderers().forEach((renderer, index) => expect(renderer.getPane()).toBe(panes[index]))
        expect(panes.map((entry) => entry.height)).toEqual(heights)
        expect(chart.kernel.exportLayout().workspaces).toEqual(baseline)
      }

      for (const height of [300, 1000]) {
        ResizeObserverMock.instances[0]!.emit({
          contentRect: DOMRect.fromRect({ width: 1000, height }),
          contentBoxSize: [{ inlineSize: 1000, blockSize: height }],
        })
        chart.draw()
        expect(chart.kernel.exportLayout().workspaces).toEqual(baseline)
      }
      expect(panes.map((pane) => pane.height)).toEqual(heights)
      expect(commit).not.toHaveBeenCalled()
      expect(chart.kernel.pane.readonly.paneScaleTypes.peek().get('late-pane-a')).toBe('log')
    } finally { await chart.destroy() }
  })

  it('preserves existing proportions when adding a pane and persists only explicit boundary changes', async () => {
    const chart = mountChart(1000, 1000)
    try {
      const indicatorId = 'pane-ratio-fixture'
      registerPlotIndicator({ id: indicatorId, name: indicatorId, inputs: {}, compute: () => ({ plots: [], fills: [] }) })
      const first = chart.indicators.add(indicatorId)
      expect(first).not.toBeNull()
      const paneId = chart.indicators.subPanes.peek()[0]!.paneId
      chart.panes.update('main', { ratio: 0.8 })
      chart.panes.update(paneId, { ratio: 0.2 })
      const previous = chart.paneRatios.peek()
      chart.indicators.add(indicatorId)
      const next = chart.paneRatios.peek()
      expect(next.main! / next[paneId]!).toBeCloseTo(previous.main! / previous[paneId]!)
      chart.draw()
      expect(chart.panes.resizeBoundary('main', -40)).toBe(true)
      const resized = chart.kernel.exportLayout().workspaces
      expect(resized.kline.paneSpecs).not.toEqual(chart.kernel.createLayout().workspaces.kline.paneSpecs)
      chart.resize()
      chart.draw()
      expect(chart.kernel.exportLayout().workspaces).toEqual(resized)
    } finally { await chart.destroy() }
  })

  it('moves script placement through a domain command in both workspaces without replacing its instance', async () => {
    const chart = mountChart(1000, 1000)
    const definition = {
      id: 'placement-script', name: 'Placement script', source: 'script' as const,
      inputs: {}, compute: () => ({ plots: [], fills: [] }),
    }
    try {
      registerPlotIndicator(definition)
      const first = chart.indicators.add(definition.id)
      chart.kernel.actions.setDataView('timeshare')
      const second = chart.indicators.add(definition.id)
      updatePlotIndicator({ ...definition, position: 'main' })
      for (const [workspaceId, workspace] of Object.entries(chart.kernel.snapshotViewWorkspaces())) {
        expect(workspace.instances).toMatchObject([{ instanceId: workspaceId === 'kline' ? first : second, role: 'main', paneId: 'main' }])
        expect(workspace.paneSpecs.map((pane) => pane.id)).toEqual(['main'])
      }
      updatePlotIndicator({ ...definition, position: 'sub' })
      for (const workspace of Object.values(chart.kernel.snapshotViewWorkspaces())) {
        expect(workspace.instances[0]?.role).toBe('sub')
        expect(workspace.paneSpecs.map((pane) => pane.id)).toEqual(['main', workspace.instances[0]?.paneId])
      }
    } finally { await chart.destroy() }
  })

  it('can turn off a restored main log axis when settings are already linear', async () => {
    const source = mountChart()
    source.setPanePriceAxisScaleType(MAIN_PANE_ID, ScaleType.Log)
    const workspaces = source.kernel.snapshotViewWorkspaces()
    await source.destroy()
    const chart = mountChart(1000, 600, { initialSettings: { mainRightAxisTypeSetting: ScaleType.Linear } })
    try {
      chart.kernel.applyLayout({ version: LAYOUT_DOCUMENT_VERSION, workspaces, panePriceAxisModes: {} })
      expect(chart.kernel.pane.readonly.paneScaleTypes.peek().get(MAIN_PANE_ID)).toBe(ScaleType.Log)
      chart.setPanePriceAxisScaleType(MAIN_PANE_ID, ScaleType.Linear)
      expect(chart.kernel.pane.readonly.paneScaleTypes.peek().get(MAIN_PANE_ID)).toBe(ScaleType.Linear)
      expect(chart.getPaneRenderers()[0]?.getPane().yAxis.getScaleType()).toBe(ScaleType.Linear)
    } finally { await chart.destroy() }
  })

  it('clears stale canvases and cached geometry when switching data views', async () => {
    const chart = mountChart()
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
    } finally { await chart.destroy() }
  })

  it('removeDrawing drops id from kernel and clears selection, with undo and redo', async () => {
    const chart = mountChart()
    try {
      chart.drawing.setDrawings([createTrendLine('d1'), createTrendLine('d2')])
      chart.drawing.setSelectedIds(['d1'])
      chart.drawing.remove('d1')
      expect(chart.kernel.drawing.readonly.drawings.peek().map((drawing) => drawing.id)).toEqual(['d2'])
      expect(chart.kernel.drawing.readonly.selectedDrawingIds.peek()).toEqual([])
      expect(chart.undoDrawing()).toBe(true)
      expect(chart.drawing.drawings.peek().map((drawing) => drawing.id)).toEqual(['d1', 'd2'])
      expect(chart.drawing.selectedIds.peek()).toEqual(['d1'])
      expect(chart.redoDrawing()).toBe(true)
      expect(chart.drawing.drawings.peek().map((drawing) => drawing.id)).toEqual(['d2'])
    } finally { await chart.destroy() }
  })

  it('removeDrawing with registered session updates kernel only', async () => {
    const chart = mountChart()
    try {
      const first = createTrendLine('d1')
      chart.drawing.setDrawings([first, createTrendLine('d2')])
      const adapter = createDrawingAdapter({
        document: {
          replaceDrawings: (list) => chart.drawing.setDrawings([...list]),
          getFullDrawings: () => [...chart.kernel.drawing.readonly.drawings.peek()],
          createDrawing: () => first,
          removeDrawing: (id) => chart.drawingCommands.remove(id),
          clearDrawings: () => chart.drawing.clear(),
          setSelectedDrawingIds: (ids) => chart.drawing.setSelectedIds(ids),
          getSelectedDrawingIds: () => chart.kernel.drawing.readonly.selectedDrawingIds.peek(),
          setDrawingToolId: (id) => chart.drawing.setTool(id),
          getDrawingToolId: () => chart.kernel.drawing.readonly.drawingTool.peek(),
        },
        viewport: {
          getViewport: () => null, getKWidthKGap: () => ({ kWidth: 6, kGap: 2 }),
          getCurrentDpr: () => 1, getData: () => [], getLogicalIndexAtX: () => null,
          priceToY: () => 0, yToPrice: () => 0, getPaneInfo: () => undefined,
        },
        session: { requestDraw: () => chart.scheduleDraw() },
      })
      chart.registerDrawingSession(new DrawingInteractionController(adapter))
      chart.drawing.setSelectedIds(['d1'])
      chart.drawing.remove('d1')
      expect(chart.kernel.drawing.readonly.drawings.peek().map((drawing) => drawing.id)).toEqual(['d2'])
      expect(chart.kernel.drawing.readonly.selectedDrawingIds.peek()).toEqual([])
      chart.registerDrawingSession(null)
    } finally { await chart.destroy() }
  })

  it('setDrawingTool writes DrawingToolId to kernel', async () => {
    const chart = mountChart()
    try {
      expect(chart.kernel.drawing.readonly.drawingTool.peek()).toBe('cursor')
      chart.drawing.setTool('trend-line')
      expect(chart.kernel.drawing.readonly.drawingTool.peek()).toBe('trend-line')
      chart.drawing.setTool(null)
      expect(chart.kernel.drawing.readonly.drawingTool.peek()).toBe('cursor')
    } finally { await chart.destroy() }
  })

  it('merges settings patches in kernel SSOT and exposes them to renderer', async () => {
    const chart = mountChart()
    try {
      chart.updateSettings({ showGridLines: false })
      chart.updateSettings({ mainRightAxisTypeSetting: 'log' })
      expect(chart.kernel.settings.readonly.settings.peek().showGridLines).toBe(false)
      expect(chart.kernel.settings.readonly.settings.peek().mainRightAxisTypeSetting).toBe('log')
      expect(chart['renderer'].getSettings().showGridLines).toBe(false)
      expect(chart['renderer'].getSettings().mainRightAxisTypeSetting).toBe('log')
    } finally { await chart.destroy() }
  })

  it('restores layout settings into the actual renderer and cache resources', async () => {
    const chart = mountChart()
    try {
      const switchBackend = vi.spyOn(chart['rendererHost'], 'switchTo')
      const originalBackend = chart.kernel.settings.readonly.settings.peek().rendererBackend
      const document = chart.kernel.exportLayout()
      chart.kernel.applyLayout({ ...document, settings: {
        ...document.settings, rendererBackend: originalBackend === 'canvas' ? 'webgl' : 'canvas', marketDataCacheMaxMiB: 200,
      } })
      expect(switchBackend).toHaveBeenCalledWith(originalBackend === 'canvas' ? 'webgl' : 'canvas')
      expect(chart.getMarketDataCache().stats.peek().maxBytes).toBe(200 * 1024 * 1024)
      chart.kernel.applyLayout({ ...document, settings: {} })
      expect(chart.getMarketDataCache().stats.peek().maxBytes).toBe(50 * 1024 * 1024)
      expect(chart.kernel.settings.readonly.settings.peek().rendererBackend).toBe(originalBackend)
    } finally { await chart.destroy() }
  })
})
