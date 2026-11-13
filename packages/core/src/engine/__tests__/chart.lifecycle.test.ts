// @vitest-environment jsdom
/** 与行情数组注入无关的 Chart 生命周期、DPR、设置和文档回归。 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Chart, type ChartOptions } from '@/core/chart/index'
import { makePluginLayerId } from '@/foundation/plugin/impl/rendererLayerId'
import { ScaleType } from '@/foundation/types/scaleType'
import { createDrawingAdapter, createTrendLine } from '../drawing/__tests__/helpers/drawingTestKit'
import { DrawingInteractionController } from '../drawing/index'
import {
  registerEmptyPlot,
  registerPlotDefinition,
} from '../indicators/__tests__/helpers/plotIndicatorTestKit'
import { resolveIndicatorLayerId } from '../indicators/indicatorLayerNaming'
import { loadBuiltinIndicators } from '../indicators/registerBuiltins'
import { LAYOUT_DOCUMENT_VERSION } from '../layout/types'
import { indicatorInstanceAxisKey } from '../pane/instanceAxisKey'
import { MAIN_PANE_ID } from '../pane/types'
import { createChartDom, installChartDomStubs, ResizeObserverMock } from './helpers/chartDomTestKit'
import { createMockRenderContext } from './helpers/renderTestKit'

const defaultOptions: ChartOptions = {
  yPaddingPx: 0,
  rightAxisWidth: 0,
  leftAxisWidth: 0,
  bottomAxisHeight: 24,
  minKWidth: 2,
  maxKWidth: 50,
  panes: [{ id: 'main', ratio: 1 }],
  priceLabelWidth: 60,
}

/** 创建不选择行情的图表；这些用例只验证独立于行情的职责。 */
function mountChart(
  width = 1000,
  height = 600,
  runtime?: ConstructorParameters<typeof Chart>[2],
): Chart {
  return new Chart(createChartDom(width, height), defaultOptions, runtime)
}

/** 三窗格布局供比例、命中、拖拽和批量顺序回归共用。 */
function importPaneFixture(chart: Chart): void {
  chart.panes.importLayout([
    { id: MAIN_PANE_ID, role: 'price', ratio: 0.5, visible: true, minHeightPx: 40 },
    { id: 'layout-a', role: 'indicator', ratio: 0.25, visible: true, minHeightPx: 40 },
    { id: 'layout-b', role: 'indicator', ratio: 0.25, visible: true, minHeightPx: 40 },
  ])
}

/** 通过真实 DOM 事件提供完整的 PointerEvent 结构。 */
function pointerEvent(
  type: string,
  target: HTMLElement,
  overrides: PointerEventInit = {},
): PointerEvent {
  const event = new PointerEvent(type, {
    clientX: 100,
    clientY: 40,
    isPrimary: true,
    pointerType: 'touch',
    pointerId: 1,
    ...overrides,
  })
  Object.defineProperty(event, 'target', { value: target })
  return event
}

describe('Chart lifecycle without a market selection', () => {
  let restoreChartDomStubs: () => void
  beforeAll(loadBuiltinIndicators)
  beforeEach(() => {
    restoreChartDomStubs = installChartDomStubs()
  })
  afterEach(() => {
    restoreChartDomStubs()
    vi.restoreAllMocks()
  })

  it('applies options without mutating a frozen caller object', async () => {
    const chart = mountChart()
    try {
      const patch = Object.freeze({ yPaddingPx: 7 })
      chart.updateOptions(patch)
      expect(patch).toEqual({ yPaddingPx: 7 })
      expect(chart.getOption().yPaddingPx).toBe(7)
    } finally {
      await chart.destroy()
    }
  })

  it('resets the time view before adapting the price axis through the default positioning path', async () => {
    const chart = mountChart()
    try {
      const initialZoom = chart.kernel.zoom.readonly.zoomLevel.peek()
      chart.zoom.toLevel(initialZoom + 2)
      const position = vi.spyOn(chart['dataManager'], 'scrollToRight')
      const price = vi.spyOn(chart, 'resetPriceTransform')
      chart.resetChart()
      expect(chart.kernel.zoom.readonly.zoomLevel.peek()).toBe(initialZoom)
      expect(position).toHaveBeenCalledOnce()
      expect(price).toHaveBeenCalledWith(MAIN_PANE_ID)
      expect(position.mock.invocationCallOrder[0]).toBeLessThan(price.mock.invocationCallOrder[0]!)
    } finally {
      await chart.destroy()
    }
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
    const chart = new Chart(dom, defaultOptions)
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
    const chart = new Chart(dom, defaultOptions)
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
    const chart = mountChart()
    try {
      const scene = chart['renderer'].getScene()
      expect(chart.kernel.indicator.readonly.instances.peek()).toEqual([])
      expect(chart.legend.list()).toEqual([])
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
    } finally {
      await chart.destroy()
    }
  })

  it('falls back to default observe when device-pixel-content-box observe fails', async () => {
    ResizeObserverMock.failWithDevicePixelBox = true
    const chart = mountChart()
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
    const chart = mountChart()
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
    const chart = mountChart(6000, 4000)
    try {
      chart.resize()
      expect(chart.getViewport()).not.toBeNull()
      expect(chart.getViewport()!.dpr).toBeLessThan(3)
    } finally {
      await chart.destroy()
    }
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
    } finally {
      await chart.destroy()
    }
  })

  it('does not schedule redraw for identical render state', async () => {
    const chart = mountChart()
    try {
      const schedule = vi.spyOn(chart, 'scheduleDraw')
      chart.zoom.toLevel(2)
      chart.zoom.toLevel(2)
      expect(schedule).toHaveBeenCalledOnce()
    } finally {
      await chart.destroy()
    }
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
    } finally {
      await chart.destroy()
    }
  })

  it('projectState does not commitLayout back to kernel', async () => {
    const chart = mountChart()
    try {
      const commit = vi.spyOn(chart.kernel.pane.actions, 'commitLayout')
      commit.mockClear()
      chart['layoutManager'].projectState()
      expect(commit).not.toHaveBeenCalled()
    } finally {
      await chart.destroy()
    }
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
      chart.kernel.applyLayout({
        ...document,
        workspaces: {
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
        },
      })
      chart.draw()
      const baseline = chart.kernel.exportLayout().workspaces
      const panes = chart.getPaneRenderers().map((renderer) => renderer.getPane())
      const heights = panes.map((pane) => pane.height)
      expect(panes.map((pane) => pane.id)).toEqual(paneSpecs.map((pane) => pane.id))
      expect(chart.indicators.subPanes.peek()).toHaveLength(2)
      expect(heights[1]! / heights[2]!).toBeCloseTo(0.25 / 0.15, 1)
      const commit = vi.spyOn(chart.kernel.pane.actions, 'commitLayout')

      for (const pane of paneSpecs.slice(1)) {
        registerEmptyPlot(pane.id)
        chart.draw()
        const instance = chart.indicators.instances
          .peek()
          .find((entry) => entry.paneId === pane.id)!
        expect(
          chart.getRenderer(resolveIndicatorLayerId(pane.id, pane.id, 'renderer', instance.id)),
        ).toBeDefined()
        chart
          .getPaneRenderers()
          .forEach((renderer, index) => expect(renderer.getPane()).toBe(panes[index]))
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
    } finally {
      await chart.destroy()
    }
  })

  it('applies ratio patches without remounting indicator layers or publishing unchanged layouts', async () => {
    const chart = mountChart(1000, 1000)
    try {
      const id = 'layout-resource-fixture'
      registerEmptyPlot(id)
      const instanceId = chart.panes.add(id)!
      const paneId = chart.indicators.instances
        .peek()
        .find((instance) => instance.id === instanceId)!.paneId!
      const layerId = resolveIndicatorLayerId(id, paneId, 'renderer', instanceId)
      const layer = chart.getRenderer(layerId)
      expect(layer).toBeDefined()
      const observer = new MutationObserver(() => {})
      observer.observe(chart.getDom().rightAxisLayer, { childList: true })
      expect(chart.panes.updatePane(MAIN_PANE_ID, { ratio: 0.25 })).toBe(true)
      expect(chart.paneRatios.peek()).toEqual({ main: 0.5, [paneId]: 0.5 })
      expect(chart.getRenderer(layerId)).toBe(layer)
      expect(observer.takeRecords()).toEqual([])
      observer.disconnect()
      const notify = vi.fn()
      const unsubscribe = chart.kernel.pane.readonly.workspaces.subscribe(notify)
      const baseline = chart.paneLayout.peek()
      chart.panes.updatePane(MAIN_PANE_ID, { ratio: 0.5 })
      chart.panes.updatePane(MAIN_PANE_ID, {})
      expect(chart.paneLayout.peek()).toBe(baseline)
      expect(notify).not.toHaveBeenCalled()
      expect(chart.panes.updatePane(MAIN_PANE_ID, { ratio: Number.NaN })).toBe(false)
      expect(chart.panes.updatePane(MAIN_PANE_ID, { ratio: -1 })).toBe(false)
      unsubscribe()
    } finally {
      await chart.destroy()
    }
  })

  it('clears hidden geometry and uses visible adjacency for hit testing, including after drawing', async () => {
    const chart = mountChart(1000, 1000)
    try {
      importPaneFixture(chart)
      const hidden = chart
        .getPaneRenderers()
        .find((renderer) => renderer.getPane().id === 'layout-a')!
      const oldCenter = hidden.getPane().top + hidden.getPane().height / 2
      chart.panes.updatePane('layout-a', { visible: false })
      chart.draw()
      expect(hidden.getPane().height).toBe(0)
      expect(hidden.getDom().mainCanvas.height).toBe(0)
      const geometry = chart.kernel.pane.readonly.paneGeometry.peek()
      expect(geometry.map((pane) => pane.id)).toEqual([MAIN_PANE_ID, 'layout-b'])
      expect(chart.interaction['getPaneByY'](oldCenter)?.id).not.toBe('layout-a')
      const first = geometry[0]!
      const last = geometry[1]!
      expect(chart.interaction['hitTestPaneSeparator'](first.top + first.height)).toBe(MAIN_PANE_ID)
      expect(chart.interaction['hitTestPaneSeparator'](last.top + last.height)).toBeNull()
      expect(chart.panes.beginBoundaryResize('layout-a')).toBeNull()
      chart.panes.updatePane(MAIN_PANE_ID, { visible: false })
      chart.panes.updatePane('layout-b', { visible: false })
      expect(chart.kernel.pane.readonly.paneGeometry.peek()).toEqual([])
      expect(chart.interaction['getPaneByY'](0)).toBeNull()
      expect(chart.interaction['hitTestPaneSeparator'](0)).toBeNull()
    } finally {
      await chart.destroy()
    }
  })

  it('fits panes and gaps into a container shorter than their combined minimum heights', async () => {
    const chart = mountChart(1000, 50)
    try {
      importPaneFixture(chart)
      chart.updateOptions({ paneGap: 3 })
      chart.draw()
      const geometry = chart.kernel.pane.readonly.paneGeometry.peek()
      const height = chart.getViewport()!.plotHeight
      expect(geometry).toHaveLength(3)
      expect(geometry.every((pane) => pane.height > 0 && pane.top + pane.height <= height)).toBe(
        true,
      )
      expect(geometry.reduce((sum, pane) => sum + pane.height, 0) + 6).toBe(height)
      expect(geometry.at(-1)!.top + geometry.at(-1)!.height).toBe(height)
    } finally {
      await chart.destroy()
    }
  })

  it('uses the initial drag snapshot regardless of move frequency and changes only adjacent panes', async () => {
    const chart = mountChart(1000, 1000)
    try {
      importPaneFixture(chart)
      const geometry = chart.kernel.pane.readonly.paneGeometry.peek()
      const session = chart.panes.beginBoundaryResize(MAIN_PANE_ID)!
      for (const delta of [0.2, 0.4, 0.6, 1.2, 12.4, 100.4]) session.resize(delta)
      const stepped = chart.paneLayout.peek()
      expect(chart.kernel.pane.readonly.paneGeometry.peek()[2]!.height).toBe(geometry[2]!.height)
      importPaneFixture(chart)
      const direct = chart.panes.beginBoundaryResize(MAIN_PANE_ID)!
      direct.resize(100.4)
      expect(chart.paneLayout.peek()).toEqual(stepped)
      direct.resize(10000)
      expect(chart.kernel.pane.readonly.paneGeometry.peek()[1]!.height).toBe(40)
      expect(chart.kernel.pane.readonly.paneGeometry.peek()[2]!.height).toBe(geometry[2]!.height)
      direct.resize(0)
      expect(chart.kernel.pane.readonly.paneGeometry.peek()).toEqual(geometry)
      chart.panes.updatePane('layout-b', { visible: false })
      const changed = chart.paneLayout.peek()
      expect(direct.resize(10)).toBe(false)
      expect(chart.paneLayout.peek()).toBe(changed)
    } finally {
      await chart.destroy()
    }
  })

  it('restores original weights on returning a constrained drag to its origin', async () => {
    const chart = mountChart(1000, 1000)
    try {
      importPaneFixture(chart)
      chart.panes.updatePane('layout-a', { minHeightPx: 300 })
      const initial = chart.paneLayout.peek()
      const session = chart.panes.beginBoundaryResize(MAIN_PANE_ID)!
      expect(session.resize(-25)).toBe(true)
      expect(session.resize(0)).toBe(true)
      expect(chart.paneLayout.peek()).toEqual(initial)
      chart.updateOptions({ paneGap: 4 })
      expect(session.resize(25)).toBe(false)
    } finally {
      await chart.destroy()
    }
  })

  it('reorders all pane identities in one publication and preserves their roles', async () => {
    const chart = mountChart()
    try {
      importPaneFixture(chart)
      const notify = vi.fn()
      const unsubscribe = chart.paneLayout.subscribe(notify)
      const ids = ['layout-b', MAIN_PANE_ID, 'layout-a']
      expect(chart.panes.reorderPanes(ids)).toBe(true)
      expect(chart.paneLayout.peek().map((pane) => pane.id)).toEqual(ids)
      expect(
        chart
          .getPaneRenderers()
          .find((renderer) => renderer.getPane().id === MAIN_PANE_ID)!
          .getPane().role,
      ).toBe('price')
      expect(chart.panes.getLayoutSpecs()).toEqual(chart.paneLayout.peek())
      expect(notify).toHaveBeenCalledOnce()
      chart.panes.reorderPanes(ids)
      expect(notify).toHaveBeenCalledOnce()
      expect(chart.panes.reorderPanes([MAIN_PANE_ID, MAIN_PANE_ID, 'layout-a'])).toBe(false)
      unsubscribe()
    } finally {
      await chart.destroy()
    }
  })

  it('removes only matching definition instances from a merged pane in one publication', async () => {
    const chart = mountChart()
    try {
      registerEmptyPlot('merged-layout-a')
      registerEmptyPlot('merged-layout-b')
      const first = chart.panes.add('merged-layout-a')!
      const paneId = chart.indicators.instances.peek().find((instance) => instance.id === first)!
        .paneId!
      const target = { kind: 'pane', paneId } as const
      chart.panes.add('merged-layout-a', undefined, target)
      const retained = chart.panes.add('merged-layout-b', undefined, target)!
      const notify = vi.fn()
      const unsubscribe = chart.kernel.indicator.readonly.instances.subscribe(notify)
      chart.panes.removeInstancesByDefinition('merged-layout-a')
      expect(chart.indicators.instances.peek().map((instance) => instance.id)).toEqual([retained])
      expect(chart.panes.hasPane(paneId)).toBe(true)
      expect(notify).toHaveBeenCalledOnce()
      chart.panes.removeInstancesByDefinition('merged-layout-b')
      expect(chart.panes.hasPane(paneId)).toBe(false)
      unsubscribe()
    } finally {
      await chart.destroy()
    }
  })

  it('starts with a 3:1 split, preserves proportions on addition and persists boundary changes', async () => {
    const chart = mountChart(1000, 1000)
    try {
      const indicatorId = 'pane-ratio-fixture'
      registerEmptyPlot(indicatorId)
      const first = chart.panes.add(indicatorId)
      expect(first).not.toBeNull()
      const paneId = chart.indicators.instances.peek().find((instance) => instance.role === 'sub')!
        .paneId!
      expect(chart.paneRatios.peek().main).toBeCloseTo(0.75)
      expect(chart.paneRatios.peek()[paneId]).toBeCloseTo(0.25)
      chart.panes.updatePane('main', { ratio: 0.8 })
      chart.panes.updatePane(paneId, { ratio: 0.2 })
      const previous = chart.paneRatios.peek()
      chart.panes.add(indicatorId)
      const next = chart.paneRatios.peek()
      expect(next.main! / next[paneId]!).toBeCloseTo(previous.main! / previous[paneId]!)
      chart.draw()
      expect(chart.panes.resizeBoundary('main', -40)).toBe(true)
      const resized = chart.kernel.exportLayout().workspaces
      expect(resized.kline.paneSpecs).not.toEqual(
        chart.kernel.createLayout().workspaces.kline.paneSpecs,
      )
      chart.resize()
      chart.draw()
      expect(chart.kernel.exportLayout().workspaces).toEqual(resized)
    } finally {
      await chart.destroy()
    }
  })

  it('clearAllIndicators removes main and sub instances and recycles sub panes', async () => {
    const chart = mountChart(1000, 1000)
    try {
      registerPlotDefinition({
        id: 'clear-all-main',
        name: 'clear-all-main',
        source: 'script',
        position: 'main',
        inputs: {},
        compute: () => ({ plots: [], fills: [] }),
      })
      registerEmptyPlot('clear-all-sub')
      expect(chart.panes.add('clear-all-main')).not.toBeNull()
      expect(chart.panes.add('clear-all-sub')).not.toBeNull()
      const instances = chart.kernel.indicator.readonly.instances.peek()
      const subPane = instances.find((instance) => instance.role === 'sub')
      const mainInstance = instances.find((instance) => instance.role === 'main')
      if (subPane?.paneId === undefined || mainInstance === undefined)
        throw new Error('fixture requires main and sub instances')
      const subAxisKey = indicatorInstanceAxisKey(subPane.instanceId)
      chart.kernel.pane.actions.setPaneScaleType(subAxisKey, ScaleType.Log)

      chart.panes.clearAllIndicators()

      expect(chart.indicators.instances.peek()).toHaveLength(0)
      expect(chart.panes.getLayoutSpecs().map((spec) => spec.id)).toEqual([MAIN_PANE_ID])
      expect(chart.panes.hasPane(subPane.paneId)).toBe(false)
      expect(chart.kernel.pane.readonly.paneScaleTypes.peek().has(subAxisKey)).toBe(false)
      expect(
        chart.kernel.pane.readonly.paneScaleTypes
          .peek()
          .has(indicatorInstanceAxisKey(mainInstance.instanceId)),
      ).toBe(false)
      chart.panes.clearAllIndicators()
      expect(chart.indicators.instances.peek()).toHaveLength(0)
    } finally {
      await chart.destroy()
    }
  })

  it('removeInstancesByDefinition removes only matching instances and their panes', async () => {
    const chart = mountChart(1000, 1000)
    try {
      registerEmptyPlot('definition-a')
      registerEmptyPlot('definition-b')
      expect(chart.panes.add('definition-a')).not.toBeNull()
      expect(chart.panes.add('definition-b')).not.toBeNull()
      const instances = chart.kernel.indicator.readonly.instances.peek()
      const first = instances.find((instance) => instance.indicatorId === 'definition-a')
      const second = instances.find((instance) => instance.indicatorId === 'definition-b')
      if (first?.paneId === undefined || second?.paneId === undefined)
        throw new Error('fixture requires two sub panes')
      const firstAxisKey = indicatorInstanceAxisKey(first.instanceId)
      chart.kernel.pane.actions.setPaneScaleType(firstAxisKey, ScaleType.Log)

      chart.panes.removeInstancesByDefinition('definition-a')

      expect(
        chart.kernel.indicator.readonly.instances.peek().map((instance) => instance.indicatorId),
      ).toEqual(['definition-b'])
      expect(chart.panes.hasPane(first.paneId)).toBe(false)
      expect(chart.panes.hasPane(second.paneId)).toBe(true)
      expect(chart.kernel.pane.readonly.paneScaleTypes.peek().has(firstAxisKey)).toBe(false)
    } finally {
      await chart.destroy()
    }
  })

  it('definition replacement keeps explicit instance placement in both workspaces', async () => {
    const chart = mountChart(1000, 1000)
    const definition = {
      id: 'placement-script',
      name: 'Placement script',
      source: 'script' as const,
      inputs: {},
      compute: () => ({ plots: [], fills: [] }),
    }
    try {
      registerPlotDefinition(definition)
      const first = chart.panes.add(definition.id)
      chart.kernel.actions.setDataView('timeshare')
      const second = chart.panes.add(definition.id)
      const baseline = chart.kernel.snapshotViewWorkspaces()
      registerPlotDefinition({ ...definition, position: 'main' })
      expect(chart.kernel.snapshotViewWorkspaces()).toEqual(baseline)
      registerPlotDefinition({ ...definition, position: 'sub' })
      expect(chart.kernel.snapshotViewWorkspaces()).toEqual(baseline)
      expect(first).not.toBeNull()
      expect(second).not.toBeNull()
    } finally {
      await chart.destroy()
    }
  })

  it.each<'main' | 'sub'>(['main', 'sub'])(
    'moves a %s instance through every pane target with one live layer',
    async (position) => {
      const chart = mountChart(1000, 1000)
      const definitionId = `moving-${position}`
      registerPlotDefinition({
        id: definitionId,
        name: definitionId,
        source: 'script',
        position,
        inputs: {},
        compute: () => ({ plots: [], fills: [] }),
      })
      registerEmptyPlot(`target-${position}`)
      try {
        const targetId = chart.panes.add(`target-${position}`)!
        const targetPaneId = chart.kernel.indicator.readonly.instances
          .peek()
          .find((instance) => instance.instanceId === targetId)!.paneId
        const instanceId = chart.panes.add(definitionId, { custom: 7 })!
        const mainPane = chart
          .getPaneRenderers()
          .find((renderer) => renderer.getPane().id === MAIN_PANE_ID)!
          .getPane()
        const targets: import('../legend/types').LegendMoveTarget[] = [
          { kind: 'pane', paneId: targetPaneId },
          { kind: 'main' },
          { kind: 'newPane', anchorPaneId: MAIN_PANE_ID, placement: 'above' },
          { kind: 'newPane', anchorPaneId: MAIN_PANE_ID, placement: 'below' },
          { kind: 'pane', paneId: targetPaneId },
          { kind: 'main' },
        ]
        for (const target of targets) {
          const before = chart.kernel.indicator.readonly.instances
            .peek()
            .find((instance) => instance.instanceId === instanceId)!
          const oldId = resolveIndicatorLayerId(definitionId, before.paneId, 'renderer', instanceId)
          const oldLayer = chart.getRenderer(oldId)!
          const disposed = vi.spyOn(oldLayer, 'dispose')
          expect(chart.legend.moveTo(instanceId, target)).toBe(true)
          const current = chart.kernel.indicator.readonly.instances
            .peek()
            .find((instance) => instance.instanceId === instanceId)!
          const layerId = resolveIndicatorLayerId(
            definitionId,
            current.paneId,
            'renderer',
            instanceId,
          )
          const layer = chart.getRenderer(layerId)!
          expect(layer).toBeDefined()
          expect(layer.pane).toBe(current.paneId)
          expect(layer.visible).toBe(true)
          expect(disposed).toHaveBeenCalledTimes(1)
          expect(current.params).toEqual({ custom: 7 })
          expect(
            chart['renderer']
              .getScene()
              .layers.peek()
              .filter((candidate) => candidate.id.endsWith(`@${instanceId}`)),
          ).toHaveLength(1)
          const pane = chart
            .getPaneRenderers()
            .find((renderer) => renderer.getPane().id === current.paneId)!
            .getPane()
          expect(pane.axes.length).toBe(
            (current.paneId === MAIN_PANE_ID && position === 'sub') ||
              current.paneId === targetPaneId
              ? 2
              : 1,
          )
          expect(new Set(pane.axes.map((axis) => axis.axisId)).size).toBe(pane.axes.length)
          expect(
            chart
              .getPaneRenderers()
              .find((renderer) => renderer.getPane().id === MAIN_PANE_ID)!
              .getPane(),
          ).toBe(mainPane)
          if (before.role === 'sub' && before.paneId !== targetPaneId)
            expect(chart.panes.hasPane(before.paneId), 'source pane recycled').toBe(false)
          if (target.kind === 'newPane') {
            const ids = chart.panes.getLayoutSpecs().map((spec) => spec.id)
            expect(ids.indexOf(current.paneId) - ids.indexOf(MAIN_PANE_ID)).toBe(
              target.placement === 'above' ? -1 : 1,
            )
          }
          chart.draw()
        }
        expect(chart.panes.updateInstance(instanceId, { hidden: true })).toBe(true)
        // 隐藏只关闭可见性：对象常驻，才能从对象树重新打开。
        expect(
          chart.getRenderer(
            resolveIndicatorLayerId(definitionId, MAIN_PANE_ID, 'renderer', instanceId),
          )?.visible,
        ).toBe(false)
        expect(chart.legend.moveTo(instanceId, { kind: 'pane', paneId: targetPaneId })).toBe(true)
        expect(
          chart.panes.updateInstance(instanceId, { hidden: false, params: { custom: 9 } }),
        ).toBe(true)
        const finalId = resolveIndicatorLayerId(definitionId, targetPaneId, 'renderer', instanceId)
        expect(chart.getRenderer(finalId)?.pane).toBe(targetPaneId)
        expect(chart.panes.removeInstance(instanceId)).toBe(true)
        expect(chart.getRenderer(finalId), 'final layer removed').toBeUndefined()
        expect(chart.panes.hasPane(targetPaneId), 'target pane kept').toBe(true)
      } finally {
        await chart.destroy()
      }
    },
  )

  it('projects indicators into the object tree and routes commands through pane APIs', async () => {
    const chart = mountChart()
    const definitionId = 'object-tree-indicator'
    registerPlotDefinition({
      id: definitionId,
      name: definitionId,
      source: 'script',
      position: 'main',
      inputs: {},
      compute: () => ({ plots: [], fills: [] }),
    })
    try {
      const instanceId = chart.panes.add(definitionId)!
      const locate = () =>
        chart.objects.groups
          .peek()
          .find((group) => group.paneId === MAIN_PANE_ID)
          ?.rows.find((row) => row.objectId.endsWith(`@${instanceId}`))

      const row = locate()
      if (row === undefined) throw new Error('indicator row missing')
      expect(row).toMatchObject({ kind: 'indicator', visible: true, locked: false })
      expect(row.capabilities).toMatchObject({
        removable: true,
        hideable: true,
        orderable: true,
        movable: true,
        lockable: false,
      })

      const commands = chart.objects.commandsFor(row.objectId)
      if (commands === null) throw new Error('indicator commands missing')
      // 指标不参与锁定；显隐照常，隐藏后对象仍在树中。
      expect(commands.setLocked(true)).toBe(false)
      expect(commands.setVisible(false)).toBe(true)
      expect(locate()?.visible).toBe(false)
      expect(commands.setVisible(true)).toBe(true)
      expect(commands.remove()).toBe(true)
      expect(locate()).toBeUndefined()
    } finally {
      await chart.destroy()
    }
  })

  it('maps instance ordinal onto layer z so object order is render order', async () => {
    const chart = mountChart()
    const definitionId = 'object-tree-order'
    registerPlotDefinition({
      id: definitionId,
      name: definitionId,
      source: 'script',
      position: 'main',
      inputs: {},
      compute: () => ({ plots: [], fills: [] }),
    })
    try {
      const firstId = chart.panes.add(definitionId)!
      const secondId = chart.panes.add(definitionId)!
      const firstLayerId = resolveIndicatorLayerId(definitionId, MAIN_PANE_ID, 'renderer', firstId)
      const secondLayerId = resolveIndicatorLayerId(
        definitionId,
        MAIN_PANE_ID,
        'renderer',
        secondId,
      )
      expect(chart.getRenderer(secondLayerId)!.z).toBeGreaterThan(
        chart.getRenderer(firstLayerId)!.z,
      )

      const commands = chart.objects.commandsFor(secondLayerId)
      if (commands === null) throw new Error('indicator commands missing')
      expect(commands.move({ kind: 'pane', paneId: MAIN_PANE_ID, index: 0 })).toBe(true)

      // 顺序写回 ordinal 后，绘制层 z 同步反转，对象树与画面一致。
      expect(chart.getRenderer(secondLayerId)!.z).toBeLessThan(chart.getRenderer(firstLayerId)!.z)

      // 拖到最底端分割线：新建 Pane，并走同一套 Pane 领域命令。
      const paneCount = chart.panes.getLayoutSpecs().length
      expect(
        commands.move({ kind: 'newPane', anchorPaneId: MAIN_PANE_ID, placement: 'below' }),
      ).toBe(true)
      expect(chart.panes.getLayoutSpecs().length).toBe(paneCount + 1)
      const movedPane = chart.kernel.indicator.readonly.instances
        .peek()
        .find((instance) => instance.instanceId === secondId)?.paneId
      expect(movedPane).not.toBe(MAIN_PANE_ID)
    } finally {
      await chart.destroy()
    }
  })

  it('projects user drawings as objects and routes drawing commands', async () => {
    const chart = mountChart()
    try {
      chart.drawing.setDrawings([createTrendLine('d-a'), createTrendLine('d-b')])
      const rowsOf = () =>
        chart.objects.groups.peek().find((group) => group.paneId === MAIN_PANE_ID)?.rows ?? []
      const drawingRows = () => rowsOf().filter((row) => row.kind === 'drawing')
      const drawingIds = () =>
        drawingRows().map((row) => (row.objectId.endsWith('d-a') ? 'd-a' : 'd-b'))

      // 同 z 时后注册的图元画在上面，列表也排在前面。
      expect(drawingIds()).toEqual(['d-b', 'd-a'])
      expect(drawingRows()[0]?.label).toBe('趋势线')
      expect(drawingRows()[0]?.capabilities.movable, 'movable').toBe(false)

      const top = drawingRows()[0]!
      const commands = chart.objects.commandsFor(top.objectId)
      if (commands === null) throw new Error('drawing commands missing')

      // 跨 pane 改变价格轴语义，命令层直接拒绝。
      expect(commands.move({ kind: 'pane', paneId: 'rsi', index: 0 }), 'cross-pane move').toBe(
        false,
      )

      // 锁定禁删除，但显隐与同 pane 排序照常。
      expect(commands.setLocked(true)).toBe(true)
      expect(commands.remove(), 'locked remove').toBe(false)
      expect(commands.setVisible(false)).toBe(true)
      expect(drawingRows().find((row) => row.objectId === top.objectId)?.visible).toBe(false)

      const bottom = drawingRows().find((row) => row.objectId !== top.objectId)!
      const bottomCommands = chart.objects.commandsFor(bottom.objectId)
      if (bottomCommands === null) throw new Error('drawing commands missing')
      expect(bottomCommands.move({ kind: 'pane', paneId: MAIN_PANE_ID, index: 1 })).toBe(true)
      expect(drawingIds()).toEqual(['d-a', 'd-b'])

      expect(commands.setLocked(false)).toBe(true)
      expect(commands.remove()).toBe(true)
      expect(drawingRows()).toHaveLength(1)
    } finally {
      await chart.destroy()
    }
  })

  it('projects the main series as a non-removable system object', async () => {
    const chart = mountChart()
    try {
      const rowsOf = () =>
        chart.objects.groups.peek().find((group) => group.paneId === MAIN_PANE_ID)?.rows ?? []
      const systemRow = () => rowsOf().find((row) => row.kind === 'system')
      const row = systemRow()
      if (row === undefined) throw new Error('system object missing')

      // 未选品种时用中性占位；有品种时读取 symbol 代码。
      expect(row.label).toBe('未选择品种')
      expect(row.capabilities).toMatchObject({
        removable: false,
        hideable: true,
        orderable: true,
        movable: true,
        lockable: false,
      })

      const commands = chart.objects.commandsFor(row.objectId)
      if (commands === null) throw new Error('system commands missing')
      expect(commands.remove()).toBe(false)
      expect(commands.setLocked(true)).toBe(false)

      expect(commands.setVisible(false)).toBe(true)
      expect(systemRow()?.visible).toBe(false)
      expect(chart.getRenderer(row.objectId)?.visible).toBe(false)
      expect(commands.setVisible(true)).toBe(true)
      expect(systemRow()?.visible).toBe(true)
      expect(chart.getRenderer(row.objectId)?.visible).toBe(true)

      // 主序列可在主图层带内调整顺序：拖到指标下方后 z 变小。
      const definitionId = 'system-order-indicator'
      registerPlotDefinition({
        id: definitionId,
        name: definitionId,
        source: 'script',
        position: 'main',
        inputs: {},
        compute: () => ({ plots: [], fills: [] }),
      })
      const indicatorId = chart.panes.add(definitionId)
      if (indicatorId === null) throw new Error('indicator missing')
      const indicatorLayerId = resolveIndicatorLayerId(
        definitionId,
        MAIN_PANE_ID,
        'renderer',
        indicatorId,
      )
      expect(chart.getRenderer(row.objectId)!.z).toBeGreaterThan(
        chart.getRenderer(indicatorLayerId)!.z,
      )
      expect(commands.move({ kind: 'pane', paneId: MAIN_PANE_ID, index: 0 })).toBe(true)
      expect(chart.getRenderer(row.objectId)!.z).toBeLessThan(
        chart.getRenderer(indicatorLayerId)!.z,
      )
    } finally {
      await chart.destroy()
    }
  })

  it.each([300, 800])(
    'lays out OHLC and indicator titles together at pane width %s',
    async (paneWidth) => {
      const chart = mountChart()
      const definitionId = `title-layout-${paneWidth}`
      registerPlotDefinition({
        id: definitionId,
        name: definitionId,
        source: 'script',
        position: 'main',
        inputs: {},
        compute: () => ({ plots: [], fills: [] }),
      })
      try {
        const instanceId = chart.panes.add(definitionId)!
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
        expect(chart.panes.updateInstance(instanceId, { hidden: true })).toBe(true)
        chart.legend.projectFrame([context])
        expect(chart.legend.rows.peek().map((row) => row.y)).toEqual(rows.map((row) => row.y))
      } finally {
        await chart.destroy()
      }
    },
  )

  it('sorts panes and their indicator rows independently for added and moved instances', async () => {
    const chart = mountChart()
    const definitionId = 'independent-order'
    registerEmptyPlot(definitionId)
    try {
      const first = chart.panes.add(definitionId)!
      const second = chart.panes.add(definitionId)!
      const moved = chart.panes.add(definitionId, {}, { kind: 'main' })!
      chart.legend.moveTo(moved, {
        kind: 'newPane',
        anchorPaneId: MAIN_PANE_ID,
        placement: 'below',
      })
      const paneOf = (id: string) =>
        chart.kernel.indicator.readonly.instances
          .peek()
          .find((instance) => instance.instanceId === id)!.paneId
      const order = () => chart.panes.getLayoutSpecs().map((pane) => pane.id)
      const contexts = () =>
        chart.getPaneRenderers().map((renderer) =>
          createMockRenderContext({
            pane: { id: renderer.getPane().id, top: renderer.getPane().top },
          }),
        )
      const actions = (id: string) => {
        chart.legend.projectFrame(contexts())
        return chart.legend.rows.peek().find((row) => row.key === id)!.actions
      }
      expect(actions(moved).find((action) => action.action === 'move-pane-up')!.enabled).toBe(false)
      expect(actions(moved).find((action) => action.action === 'move-pane-down')!.enabled).toBe(
        true,
      )
      expect(
        actions(moved).some(
          (action) => action.action === 'move-up' || action.action === 'move-down',
        ),
      ).toBe(false)
      const firstPane = paneOf(first)
      const movedPane = paneOf(moved)
      chart.legend.execute(moved, 'move-pane-down')
      expect(order()).toEqual([MAIN_PANE_ID, firstPane, movedPane, paneOf(second)])
      expect(paneOf(moved)).toBe(movedPane)
      chart.legend.execute(moved, 'move-pane-up')
      expect(order()).toEqual([MAIN_PANE_ID, movedPane, firstPane, paneOf(second)])
      chart.legend.moveTo(moved, { kind: 'pane', paneId: firstPane })
      const paneOrder = order()
      expect(actions(moved).find((action) => action.action === 'move-up')!.enabled).toBe(true)
      chart.legend.execute(moved, 'move-up')
      expect(
        chart.legend
          .list()
          .filter((entry) => entry.paneId === firstPane)
          .map((entry) => entry.id),
      ).toEqual([moved, first])
      expect(order()).toEqual(paneOrder)
      chart.legend.execute(moved, 'move-down')
      expect(
        chart.legend
          .list()
          .filter((entry) => entry.paneId === firstPane)
          .map((entry) => entry.id),
      ).toEqual([first, moved])
      chart.legend.execute(first, 'move-pane-down')
      expect(order()).toEqual([MAIN_PANE_ID, paneOf(second), firstPane])
      expect(paneOf(moved)).toBe(firstPane)
      expect(actions(first).find((action) => action.action === 'move-pane-down')!.enabled).toBe(
        false,
      )
    } finally {
      await chart.destroy()
    }
  })

  it('can turn off a restored main log axis when settings are already linear', async () => {
    const source = mountChart()
    source.setPanePriceAxisScaleType(MAIN_PANE_ID, ScaleType.Log)
    const workspaces = source.kernel.snapshotViewWorkspaces()
    await source.destroy()
    const chart = mountChart(1000, 600, {
      initialSettings: { mainRightAxisTypeSetting: ScaleType.Linear },
    })
    try {
      chart.kernel.applyLayout({
        version: LAYOUT_DOCUMENT_VERSION,
        workspaces,
        panePriceAxisModes: {},
      })
      expect(chart.kernel.pane.readonly.paneScaleTypes.peek().get(MAIN_PANE_ID)).toBe(ScaleType.Log)
      chart.setPanePriceAxisScaleType(MAIN_PANE_ID, ScaleType.Linear)
      expect(chart.kernel.pane.readonly.paneScaleTypes.peek().get(MAIN_PANE_ID)).toBe(
        ScaleType.Linear,
      )
      expect(chart.getPaneRenderers()[0]?.getPane().yAxis.getScaleType()).toBe(ScaleType.Linear)
    } finally {
      await chart.destroy()
    }
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
    } finally {
      await chart.destroy()
    }
  })

  it('removeDrawing drops id from kernel and clears selection, with undo and redo', async () => {
    const chart = mountChart()
    try {
      chart.drawing.setDrawings([createTrendLine('d1'), createTrendLine('d2')])
      chart.drawing.setSelectedIds(['d1'])
      chart.drawing.remove('d1')
      expect(chart.kernel.drawing.readonly.drawings.peek().map((drawing) => drawing.id)).toEqual([
        'd2',
      ])
      expect(chart.kernel.drawing.readonly.selectedDrawingIds.peek()).toEqual([])
      expect(chart.undoDrawing()).toBe(true)
      expect(chart.drawing.drawings.peek().map((drawing) => drawing.id)).toEqual(['d1', 'd2'])
      expect(chart.drawing.selectedIds.peek()).toEqual(['d1'])
      expect(chart.redoDrawing()).toBe(true)
      expect(chart.drawing.drawings.peek().map((drawing) => drawing.id)).toEqual(['d2'])
    } finally {
      await chart.destroy()
    }
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
          getViewport: () => null,
          getKWidthKGap: () => ({ kWidth: 6, kGap: 2 }),
          getCurrentDpr: () => 1,
          getData: () => [],
          getLogicalIndexAtX: () => null,
          priceToY: () => 0,
          yToPrice: () => 0,
          getPaneInfo: () => undefined,
        },
        session: { requestDraw: () => chart.scheduleDraw() },
      })
      chart.registerDrawingSession(new DrawingInteractionController(adapter))
      chart.drawing.setSelectedIds(['d1'])
      chart.drawing.remove('d1')
      expect(chart.kernel.drawing.readonly.drawings.peek().map((drawing) => drawing.id)).toEqual([
        'd2',
      ])
      expect(chart.kernel.drawing.readonly.selectedDrawingIds.peek()).toEqual([])
      chart.registerDrawingSession(null)
    } finally {
      await chart.destroy()
    }
  })

  it('setDrawingTool writes DrawingToolId to kernel', async () => {
    const chart = mountChart()
    try {
      expect(chart.kernel.drawing.readonly.drawingTool.peek()).toBe('cursor')
      chart.drawing.setTool('trend-line')
      expect(chart.kernel.drawing.readonly.drawingTool.peek()).toBe('trend-line')
      chart.drawing.setTool(null)
      expect(chart.kernel.drawing.readonly.drawingTool.peek()).toBe('cursor')
    } finally {
      await chart.destroy()
    }
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
    } finally {
      await chart.destroy()
    }
  })

  it('restores layout settings into the actual renderer and cache resources', async () => {
    const chart = mountChart()
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
      expect(chart.getMarketDataCache().stats.peek().maxBytes).toBe(200 * 1024 * 1024)
      chart.kernel.applyLayout({ ...document, settings: {} })
      expect(chart.getMarketDataCache().stats.peek().maxBytes).toBe(50 * 1024 * 1024)
      expect(chart.kernel.settings.readonly.settings.peek().rendererBackend).toBe(originalBackend)
    } finally {
      await chart.destroy()
    }
  })
})
