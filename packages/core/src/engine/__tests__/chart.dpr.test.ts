// @vitest-environment jsdom
import { afterEach, beforeEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { loadBuiltinIndicators } from '../indicators/registerBuiltins'
import { getRegisteredIndicatorDefinition } from '../indicators/indicatorDefinitionRegistry'

import { Chart, type ChartDom, type ChartOptions } from '@/core/chart'

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = []
  static failWithDevicePixelBox = false

  private callback: ResizeObserverCallback
  observe = vi.fn((target: Element, options?: ResizeObserverOptions) => {
    if (options?.box === 'device-pixel-content-box' && ResizeObserverMock.failWithDevicePixelBox) {
      throw new Error('device-pixel-content-box not supported')
    }
  })
  disconnect = vi.fn()

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    ResizeObserverMock.instances.push(this)
  }

  emit(entry: Partial<ResizeObserverEntry>) {
    this.callback([entry as ResizeObserverEntry], this as unknown as ResizeObserver)
  }

  static reset() {
    ResizeObserverMock.instances = []
    ResizeObserverMock.failWithDevicePixelBox = false
  }
}

const defaultOptions: ChartOptions = {
  kWidth: 10,
  kGap: 2,
  yPaddingPx: 0,
  rightAxisWidth: 0,
  leftAxisWidth: 0,
  bottomAxisHeight: 24,
  minKWidth: 2,
  maxKWidth: 50,
  panes: [{ id: 'main', ratio: 1 }],
  priceLabelWidth: 60,
}

function createCanvasContextStub() {
  return {
    setTransform: vi.fn(),
    scale: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 40 })),
  } as unknown as CanvasRenderingContext2D
}

function createWebGLStub(): WebGL2RenderingContext {
  const noop = () => {}
  return new Proxy({} as unknown as WebGL2RenderingContext, {
    get(_, prop) {
      if (typeof prop !== 'string') return undefined
      if (/^[A-Z][A-Z0-9_]*$/.test(prop)) return 0
      if (prop === 'getShaderInfoLog' || prop === 'getProgramInfoLog') return () => ''
      if (prop === 'getShaderParameter' || prop === 'getProgramParameter') return () => true
      if (prop === 'getError') return () => 0
      if (prop === 'getSupportedExtensions') return () => []
      if (prop === 'getContextAttributes') return () => ({})
      if (prop === 'getParameter') return () => 0
      if (prop === 'getUniformLocation' || prop === 'getAttribLocation') return () => 0
      if (prop.startsWith('create') || prop === 'getExtension') return () => ({ __webglStub: true })
      if (prop === 'drawingBufferWidth' || prop === 'drawingBufferHeight') return 300
      return noop
    },
  }) as WebGL2RenderingContext
}

function createDom(width: number, height: number): ChartDom {
  const container = document.createElement('div')
  const canvasLayer = document.createElement('div')
  const rightAxisLayer = document.createElement('div')
  const xAxisCanvas = document.createElement('canvas')

  Object.defineProperty(container, 'clientWidth', { configurable: true, value: width })
  Object.defineProperty(container, 'clientHeight', { configurable: true, value: height })
  Object.defineProperty(container, 'scrollLeft', { configurable: true, writable: true, value: 0 })

  container.appendChild(canvasLayer)
  container.appendChild(rightAxisLayer)
  canvasLayer.appendChild(xAxisCanvas)

  return {
    container: container as HTMLDivElement,
    canvasLayer: canvasLayer as HTMLDivElement,
    rightAxisLayer: rightAxisLayer as HTMLDivElement,
    xAxisCanvas,
  }
}

describe('Chart DPR pipeline', () => {
  const originalResizeObserver = globalThis.ResizeObserver
  const originalDevicePixelRatio = window.devicePixelRatio
  const originalGetContext = HTMLCanvasElement.prototype.getContext

  beforeAll(async () => {
    await loadBuiltinIndicators()
  })

  beforeEach(() => {
    ResizeObserverMock.reset()
    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver

    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      writable: true,
      value: 1,
    })

    HTMLCanvasElement.prototype.getContext = vi.fn(function (
      this: HTMLCanvasElement,
      type: string,
    ) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
        return createWebGLStub() as unknown as RenderingContext
      }
      return createCanvasContextStub() as unknown as RenderingContext
    }) as unknown as typeof HTMLCanvasElement.prototype.getContext
  })

  afterEach(async () => {
    globalThis.ResizeObserver = originalResizeObserver
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      writable: true,
      value: originalDevicePixelRatio,
    })
    HTMLCanvasElement.prototype.getContext = originalGetContext
    vi.restoreAllMocks()
  })

  it('mounts renderer layers for restored sub-pane indicators', async () => {
    const chart = new Chart(createDom(1000, 600), defaultOptions, {
      initialViewWorkspaces: {
        kline: {
          instances: [
            {
              instanceId: 'user:rsi-0',
              indicatorId: 'RSI',
              paneId: 'RSI_0',
              role: 'sub',
              ordinal: 0,
              params: {},
            },
          ],
          paneRatios: { main: 0.75, RSI_0: 0.25 },
          paneSpecs: [
            { id: 'main', ratio: 0.75, role: 'price' },
            { id: 'RSI_0', ratio: 0.25, role: 'indicator' },
          ],
          paneScaleTypes: {},
        },
        timeshare: {
          instances: [],
          paneRatios: { main: 1 },
          paneSpecs: [{ id: 'main', ratio: 1, role: 'price' }],
          paneScaleTypes: {},
        },
      },
    })

    const rsiRendererName = getRegisteredIndicatorDefinition('RSI')?.rendererFactory({
      paneId: 'RSI_0',
      indicatorId: 'RSI',
    }).name
    expect(rsiRendererName).toBeDefined()
    expect(chart.getRenderer(rsiRendererName!)).toBeDefined()
    await chart.destroy()
  })

  it('falls back to default observe when device-pixel-content-box observe fails', async () => {
    ResizeObserverMock.failWithDevicePixelBox = true
    const chart = new Chart(createDom(1000, 600), defaultOptions)

    const ro = ResizeObserverMock.instances[0]
    expect(ro).toBeDefined()
    expect(ro?.observe).toHaveBeenCalledTimes(2)
    expect(ro?.observe).toHaveBeenNthCalledWith(1, chart.getDom().container, {
      box: 'device-pixel-content-box',
    })
    expect(ro?.observe).toHaveBeenNthCalledWith(2, chart.getDom().container)

    await chart.destroy()
  })

  it('prefers precise DPR from ResizeObserver devicePixelContentBoxSize', async () => {
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      writable: true,
      value: 1,
    })

    const chart = new Chart(createDom(1000, 600), defaultOptions)
    const ro = ResizeObserverMock.instances[0]

    ro?.emit({
      contentRect: { width: 1000, height: 600 } as DOMRectReadOnly,
      devicePixelContentBoxSize: [
        { inlineSize: 2000, blockSize: 1200 },
      ] as unknown as ResizeObserverSize[],
      contentBoxSize: [{ inlineSize: 1000, blockSize: 600 }] as unknown as ResizeObserverSize[],
    })

    expect(chart.getCurrentDpr()).toBe(2)

    await chart.destroy()
  })

  it('falls back to rounded window.devicePixelRatio when precise DPR is unavailable', async () => {
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      writable: true,
      value: 1.234,
    })

    const chart = new Chart(createDom(1000, 600), defaultOptions)
    const ro = ResizeObserverMock.instances[0]

    ro?.emit({
      contentRect: { width: 1000, height: 600 } as DOMRectReadOnly,
      contentBoxSize: [{ inlineSize: 1000, blockSize: 600 }] as unknown as ResizeObserverSize[],
    })

    expect(chart.getCurrentDpr()).toBe(Math.round(1.234 * 64) / 64)

    await chart.destroy()
  })

  it('clamps DPR to at least 1', async () => {
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      writable: true,
      value: 0.5,
    })

    const chart = new Chart(createDom(1000, 600), defaultOptions)
    const ro = ResizeObserverMock.instances[0]

    ro?.emit({
      contentRect: { width: 1000, height: 600 } as DOMRectReadOnly,
      contentBoxSize: [{ inlineSize: 1000, blockSize: 600 }] as unknown as ResizeObserverSize[],
    })

    expect(chart.getCurrentDpr()).toBe(1)

    await chart.destroy()
  })

  it('reduces viewport DPR when requested pixels exceed MAX_CANVAS_PIXELS', async () => {
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      writable: true,
      value: 3,
    })

    const chart = new Chart(createDom(6000, 4000), defaultOptions)
    chart.resize()

    const viewport = chart.getViewport()
    expect(viewport).not.toBeNull()
    expect(viewport!.dpr).toBeLessThan(3)

    await chart.destroy()
  })

  it('disconnects ResizeObserver on destroy', async () => {
    const chart = new Chart(createDom(1000, 600), defaultOptions)
    const ro = ResizeObserverMock.instances[0]

    await chart.destroy()

    expect(ro?.disconnect).toHaveBeenCalledTimes(1)
  })

  it('does not emit viewport change on draw when viewport is unchanged', async () => {
    const chart = new Chart(createDom(1000, 600), defaultOptions)
    const onViewportChange = vi.fn()

    chart.viewport.subscribe(onViewportChange)
    chart.draw()
    chart.draw()

    // draw 只读 viewport，不写 signal
    expect(onViewportChange).toHaveBeenCalledTimes(0)

    await chart.destroy()
  })

  it('publishes each DOM scroll position before scheduling its frame', async () => {
    const dom = createDom(1000, 600)
    const chart = new Chart(dom, defaultOptions)
    const data = Array.from({ length: 200 }, (_, index) => ({
      timestamp: index,
      open: 10,
      high: 11,
      low: 9,
      close: 10,
    }))
    chart.setData(data)
    const scheduleDrawSpy = vi.spyOn(chart, 'scheduleDraw').mockImplementation(() => {})

    dom.container.scrollLeft = 900
    chart.handleScrollEvent()

    expect(chart.kernel.viewport.readonly.scrollLeft.peek()).toBe(900)
    expect(chart.getViewport()?.scrollLeft).toBe(-100)
    expect(scheduleDrawSpy).toHaveBeenCalledTimes(1)

    await chart.destroy()
  })

  it('does not schedule redraw for identical render state', async () => {
    const chart = new Chart(createDom(1000, 600), defaultOptions)
    const scheduleDrawSpy = vi.spyOn(chart, 'scheduleDraw')

    chart.applyRenderState(12, 3, 2)
    chart.applyRenderState(12, 3, 2)

    expect(scheduleDrawSpy).toHaveBeenCalledTimes(1)

    await chart.destroy()
  })

  it('routes custom markers through kernel and clears position cache', async () => {
    const chart = new Chart(createDom(1000, 600), defaultOptions)
    const manager = chart.markers.getManager()
    const scheduleDrawSpy = vi.spyOn(chart, 'scheduleDraw')
    const clearCacheSpy = vi.spyOn(manager, 'clearPositionCache')

    const marker = {
      id: 'm1',
      date: '2025-01-15',
      timestamp: 1,
      shape: 'circle' as const,
    }

    chart.markers.update([marker])
    expect(manager.getCustomMarkers().map((m) => m.id)).toEqual(['m1'])
    expect(clearCacheSpy).toHaveBeenCalled()
    expect(scheduleDrawSpy).toHaveBeenCalled()

    manager.setCustomMarkerPosition('m1', 10, 20, 12, 'circle')
    expect(manager.hitTestCustomMarker(10, 20)?.id).toBe('m1')

    clearCacheSpy.mockClear()
    scheduleDrawSpy.mockClear()
    chart.markers.clear()
    expect(manager.getCustomMarkers()).toEqual([])
    expect(clearCacheSpy).toHaveBeenCalledTimes(1)
    expect(scheduleDrawSpy).toHaveBeenCalled()
    expect(manager.hitTestCustomMarker(10, 20)).toBeNull()

    clearCacheSpy.mockClear()
    chart.markers.register({ ...marker, id: 'm2', shape: 'flag' })
    expect(manager.getCustomMarkers().map((m) => m.id)).toEqual(['m2'])
    expect(clearCacheSpy).toHaveBeenCalledTimes(1)

    await chart.destroy()
  })

  it('routes drawings through kernel for store projection', async () => {
    const chart = new Chart(createDom(1000, 600), defaultOptions)
    const store = chart.drawing.getStore()
    const scheduleDrawSpy = vi.spyOn(chart, 'scheduleDraw')
    const drawing = {
      id: 'd1',
      kind: 'trend-line' as const,
      paneId: 'main',
      visible: true,
      anchors: [],
      params: {},
      style: { stroke: '#2962ff' },
    }

    chart.drawing.setDrawings([drawing])
    expect(chart.drawing.drawings.peek().map((d) => d.id)).toEqual(['d1'])
    expect(store.getAll().map((d) => d.id)).toEqual(['d1'])
    expect(scheduleDrawSpy).toHaveBeenCalled()

    chart.drawing.setSelectedIds(['d1'])
    expect(store.getSelectedIds()).toEqual(['d1'])

    scheduleDrawSpy.mockClear()
    chart.drawing.setDrawings([])
    expect(store.getAll()).toEqual([])
    expect(store.getSelectedIds()).toEqual([])
    expect(scheduleDrawSpy).toHaveBeenCalled()

    await chart.destroy()
  })

  it('projectState does not commitLayout back to kernel', async () => {
    const chart = new Chart(createDom(1000, 600), defaultOptions)
    const commitSpy = vi.spyOn(chart.kernel.pane.actions, 'commitLayout')
    commitSpy.mockClear()

    const layout = (chart as unknown as { layoutManager: { projectState: Function } }).layoutManager
    layout.projectState(
      [
        { id: 'main', ratio: 0.7, role: 'price', visible: true },
        { id: 'MACD_0', ratio: 0.3, role: 'indicator', visible: true },
      ],
      { main: 0.7, MACD_0: 0.3 },
    )

    expect(commitSpy).not.toHaveBeenCalled()
    await chart.destroy()
  })
})

describe('Chart pane layout regressions', () => {
  const originalResizeObserver = globalThis.ResizeObserver
  const originalDevicePixelRatio = window.devicePixelRatio
  const originalGetContext = HTMLCanvasElement.prototype.getContext

  beforeEach(() => {
    ResizeObserverMock.reset()
    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver

    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      writable: true,
      value: 1,
    })

    HTMLCanvasElement.prototype.getContext = vi.fn(function (
      this: HTMLCanvasElement,
      type: string,
    ) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
        return createWebGLStub() as unknown as RenderingContext
      }
      return createCanvasContextStub() as unknown as RenderingContext
    }) as unknown as typeof HTMLCanvasElement.prototype.getContext
  })

  afterEach(async () => {
    globalThis.ResizeObserver = originalResizeObserver
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      writable: true,
      value: originalDevicePixelRatio,
    })
    HTMLCanvasElement.prototype.getContext = originalGetContext
    vi.restoreAllMocks()
  })

  it('allocates initial pane ratios as 3:1:1 for main+MACD+RSI', async () => {
    const chart = new Chart(createDom(1000, 600), defaultOptions)
    chart.resize()

    expect(chart.panes.create({ paneId: 'MACD_0', indicatorId: 'MACD', params: {} })).toBe(true)
    expect(chart.panes.create({ paneId: 'RSI_0', indicatorId: 'RSI', params: {} })).toBe(true)

    const specs = chart.panes.getLayoutSpecs().filter((pane) => pane.visible !== false)
    expect(specs).toHaveLength(3)

    // 公共读对齐 kernel SSOT（create pane 3:1:1 → 0.6:0.2:0.2）
    const byId = new Map(specs.map((pane) => [pane.id, pane]))
    expect(byId.get('main')?.ratio ?? 0).toBeCloseTo(0.6, 6)
    expect(byId.get('MACD_0')?.ratio ?? 0).toBeCloseTo(0.2, 6)
    expect(byId.get('RSI_0')?.ratio ?? 0).toBeCloseTo(0.2, 6)

    await chart.destroy()
  })

  it('keeps indicator pane heights equal for main+MACD+RSI', async () => {
    const chart = new Chart(createDom(1000, 600), defaultOptions)
    chart.resize()
    chart.panes.create({ paneId: 'MACD_0', indicatorId: 'MACD', params: {} })
    chart.panes.create({ paneId: 'RSI_0', indicatorId: 'RSI', params: {} })
    chart.resize()

    const panes = chart.getPaneRenderers().map((renderer) => renderer.getPane())
    const macd = panes.find((pane) => pane.id === 'MACD_0')
    const rsi = panes.find((pane) => pane.id === 'RSI_0')

    expect(macd).toBeDefined()
    expect(rsi).toBeDefined()
    expect(Math.abs((macd?.height ?? 0) - (rsi?.height ?? 0))).toBeLessThanOrEqual(1)

    await chart.destroy()
  })

  it('keeps visible ratio sum at 1 after boundary resize', async () => {
    const chart = new Chart(createDom(1000, 800), defaultOptions)
    chart.resize()
    chart.panes.create({ paneId: 'MACD_0', indicatorId: 'MACD', params: {} })
    chart.panes.create({ paneId: 'RSI_0', indicatorId: 'RSI', params: {} })
    chart.resize()

    const resized = chart.panes.resizeBoundary('MACD_0', 20)
    expect(resized).toBe(true)

    const visible = chart.panes.getLayoutSpecs().filter((pane) => pane.visible !== false)
    const sum = visible.reduce((acc, pane) => acc + pane.ratio, 0)
    expect(sum).toBeCloseTo(1, 6)

    await chart.destroy()
  })

  it('returns false and keeps layout unchanged for invalid boundary resize input', async () => {
    const chart = new Chart(createDom(1000, 600), defaultOptions)
    chart.resize()
    chart.panes.create({ paneId: 'MACD_0', indicatorId: 'MACD', params: {} })
    chart.panes.create({ paneId: 'RSI_0', indicatorId: 'RSI', params: {} })
    chart.resize()

    const before = chart.panes.getLayoutSpecs()
    const invalidId = chart.panes.resizeBoundary('missing-pane-id', 20)
    const zeroDelta = chart.panes.resizeBoundary('main', 0)
    const after = chart.panes.getLayoutSpecs()

    expect(invalidId).toBe(false)
    expect(zeroDelta).toBe(false)
    expect(after).toEqual(before)

    await chart.destroy()
  })

  it('updateSettings mainRightAxisTypeSetting writes paneScaleTypes then projects', async () => {
    const chart = new Chart(createDom(1000, 600), defaultOptions)
    chart.resize()
    chart.updateSettings({ mainRightAxisTypeSetting: 'log' })
    expect(chart.kernel.pane.readonly.paneScaleTypes.peek().get('main')).toBe('log')
    const main = chart.getPaneRenderers()[0]?.getPane()
    expect(main?.yAxis.getScaleType()).toBe('log')
    await chart.destroy()
  })

  it('createPane seeds scale from settings and projects', async () => {
    const chart = new Chart(createDom(1000, 600), defaultOptions)
    chart.resize()
    chart.updateSettings({ mainRightAxisTypeSetting: 'log' })
    expect(chart.panes.create({ paneId: 'MACD_0', indicatorId: 'MACD', params: {} })).toBe(true)
    expect(chart.kernel.pane.readonly.paneScaleTypes.peek().get('main')).toBe('log')
    expect(chart.kernel.pane.readonly.paneScaleTypes.peek().get('MACD_0')).toBe('log')
    const macd = chart
      .getPaneRenderers()
      .find((r) => r.getPane().id === 'MACD_0')
      ?.getPane()
    expect(macd?.yAxis.getScaleType()).toBe('log')
    await chart.destroy()
  })

  it('enter timeshare writes the price pane percent scale to kernel', async () => {
    const chart = new Chart(createDom(1000, 600), defaultOptions)
    chart.resize()
    chart.updateSettings({ mainRightAxisTypeSetting: 'log' })
    const tsMode = (
      chart as unknown as { _timeShareMode: import('../modes/types').ChartModeHandler }
    )._timeShareMode
    chart.setActiveMode(tsMode)
    expect(chart.kernel.pane.readonly.paneScaleTypes.peek().get('main')).toBe('percent')
    expect(chart.getPaneRenderers()[0]?.getPane().yAxis.getScaleType()).toBe('percent')
    expect(chart.kernel.mode.readonly.dataView.peek()).toBe('timeshare')
    await chart.destroy()
  })

  it('setActiveMode updates kernel chartMode', async () => {
    const chart = new Chart(createDom(1000, 600), defaultOptions)
    expect(chart.kernel.mode.readonly.chartMode.peek()).toBe('kline')
    const tsMode = (
      chart as unknown as { _timeShareMode: import('../modes/types').ChartModeHandler }
    )._timeShareMode
    const kMode = (chart as unknown as { _kLineMode: import('../modes/types').ChartModeHandler })
      ._kLineMode
    chart.setActiveMode(tsMode)
    expect(chart.kernel.mode.readonly.chartMode.peek()).toBe('timeshare')
    chart.setActiveMode(kMode)
    expect(chart.kernel.mode.readonly.chartMode.peek()).toBe('kline')
    await chart.destroy()
  })

  it('clears stale canvases and cached geometry when switching data views', async () => {
    const chart = new Chart(createDom(1000, 600), defaultOptions)
    const renderer = (
      chart as unknown as {
        renderer: { clearAllCanvases: () => void; clearCachedFrame: () => void }
      }
    ).renderer
    const clearCanvases = vi.spyOn(renderer, 'clearAllCanvases')
    const clearCachedFrame = vi.spyOn(renderer, 'clearCachedFrame')
    ;(
      chart as unknown as { _legendTemplateContext: { set: (value: unknown) => void } }
    )._legendTemplateContext.set({ stale: true })
    const tsMode = (
      chart as unknown as { _timeShareMode: import('../modes/types').ChartModeHandler }
    )._timeShareMode

    chart.setActiveMode(tsMode)

    expect(clearCanvases).toHaveBeenCalledOnce()
    expect(clearCachedFrame).toHaveBeenCalledOnce()
    expect(chart.legendTemplateContext.peek()).toBeNull()
    await chart.destroy()
  })

  it('timeshare switching preserves independent indicator workspaces and layouts', async () => {
    const chart = new Chart(createDom(1000, 600), defaultOptions)
    chart.resize()
    expect(chart.indicators.enableMain('MA')).toBe(true)
    expect(chart.panes.create({ paneId: 'MACD_0', indicatorId: 'MACD', params: {} })).toBe(true)
    expect(chart.panes.create({ paneId: 'RSI_0', indicatorId: 'RSI', params: {} })).toBe(true)
    const ratiosBefore = { ...chart.kernel.pane.readonly.paneRatios.peek() }
    const entriesBefore = chart.indicators.subPanes.peek().map((e) => ({
      paneId: e.paneId,
      indicatorId: e.indicatorId,
    }))

    const tsMode = (
      chart as unknown as { _timeShareMode: import('../modes/types').ChartModeHandler }
    )._timeShareMode
    const kMode = (chart as unknown as { _kLineMode: import('../modes/types').ChartModeHandler })
      ._kLineMode
    chart.setActiveMode(tsMode)
    expect(chart.indicators.subPanes.peek()).toEqual([])
    expect(
      chart.panes.create({ paneId: 'TS_RSI_0', indicatorId: 'RSI', params: { period: 7 } }),
    ).toBe(true)
    const timeShareEntries = chart.indicators.subPanes.peek().map((e) => ({
      paneId: e.paneId,
      indicatorId: e.indicatorId,
    }))
    expect(timeShareEntries).toEqual([{ paneId: 'TS_RSI_0', indicatorId: 'RSI' }])
    chart.setActiveMode(kMode)

    const entriesAfter = chart.indicators.subPanes.peek().map((e) => ({
      paneId: e.paneId,
      indicatorId: e.indicatorId,
    }))
    expect(entriesAfter).toEqual(entriesBefore)
    expect(chart.kernel.pane.readonly.paneRatios.peek()).toEqual(ratiosBefore)
    chart.setActiveMode(tsMode)
    expect(
      chart.indicators.subPanes.peek().map((e) => ({ paneId: e.paneId, indicatorId: e.indicatorId })),
    ).toEqual(timeShareEntries)
    await chart.destroy()
  })

  it('timeshare does not reuse a K-line volume pane', async () => {
    const chart = new Chart(createDom(1000, 600), defaultOptions)
    chart.resize()
    const volumePaneId = chart.indicators.add('VOL', 'sub')
    expect(volumePaneId).not.toBeNull()
    const tsMode = (
      chart as unknown as { _timeShareMode: import('../modes/types').ChartModeHandler }
    )._timeShareMode
    const kMode = (chart as unknown as { _kLineMode: import('../modes/types').ChartModeHandler })
      ._kLineMode

    chart.setActiveMode(tsMode)
    expect(chart.indicators.subPanes.peek()).toEqual([])
    const timeShareVolumePaneId = chart.indicators.add('VOL', 'sub')
    expect(timeShareVolumePaneId).not.toBeNull()

    chart.setActiveMode(kMode)
    expect(chart.indicators.subPanes.peek()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ instanceId: volumePaneId, indicatorId: 'volume' }),
      ]),
    )
    chart.setActiveMode(tsMode)
    expect(chart.indicators.subPanes.peek()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ instanceId: timeShareVolumePaneId, indicatorId: 'volume' }),
      ]),
    )
    await chart.destroy()
  })

  it('removeDrawing drops id from kernel and clears selection', async () => {
    const chart = new Chart(createDom(1000, 600), defaultOptions)
    const d1 = {
      id: 'd1',
      kind: 'trend-line' as const,
      paneId: 'main',
      visible: true,
      anchors: [],
      params: {},
      style: { stroke: '#f00' },
    }
    const d2 = { ...d1, id: 'd2' }
    chart.drawing.setDrawings([d1, d2])
    chart.drawing.setSelectedIds(['d1'])
    chart.drawing.remove('d1')
    expect(chart.kernel.drawing.readonly.drawings.peek().map((d) => d.id)).toEqual(['d2'])
    expect(chart.kernel.drawing.readonly.selectedDrawingIds.peek()).toEqual([])
    await chart.destroy()
  })

  it('removeDrawing with registered session updates kernel only', async () => {
    const { DrawingInteractionController } = await import('../drawing/interaction')
    const chart = new Chart(createDom(1000, 600), defaultOptions)
    const d1 = {
      id: 'd1',
      kind: 'trend-line' as const,
      paneId: 'main',
      visible: true,
      anchors: [],
      params: {},
      style: { stroke: '#f00' },
    }
    const d2 = { ...d1, id: 'd2' }
    chart.drawing.setDrawings([d1, d2])
    chart.drawing.setSelectedIds(['d1'])

    const adapter = {
      replaceDrawings: (list: ReadonlyArray<typeof d1>) => chart.drawing.setDrawings([...list]),
      getFullDrawings: () => [...chart.kernel.drawing.readonly.drawings.peek()],
      createDrawing: () => d1,
      updateDrawing: () => null,
      commitDrawingDrag: () => null,
      removeDrawing: (id: string) => {
        const removed = chart.kernel.drawing.actions.removeDrawing(id)
        if (removed) chart.scheduleDraw()
        return removed
      },
      clearDrawings: () => chart.drawing.clear(),
      setSelectedDrawingIds: (ids: ReadonlyArray<string>) => chart.drawing.setSelectedIds(ids),
      getSelectedDrawingIds: () => chart.kernel.drawing.readonly.selectedDrawingIds.peek(),
      setDrawingToolId: (id: import('../drawing/toolConfig').DrawingToolId) =>
        chart.drawing.setTool(id),
      getDrawingToolId: () => chart.kernel.drawing.readonly.drawingTool.peek(),
      requestDraw: () => chart.scheduleDraw(),
      getViewport: () => null,
      getKWidthKGap: () => ({ kWidth: 6, kGap: 2 }),
      getCurrentDpr: () => 1,
      getData: () => [],
      getLogicalIndexAtX: () => null,
      getTimestampAtLogicalIndex: () => null,
      priceToY: () => 0,
      yToPrice: () => 0,
      getPaneInfo: () => undefined,
    }
    const session = new DrawingInteractionController(adapter)
    chart.registerDrawingSession(session)
    chart.drawing.setSelectedIds(['d1'])
    chart.drawing.remove('d1')
    expect(chart.kernel.drawing.readonly.drawings.peek().map((d) => d.id)).toEqual(['d2'])
    expect(chart.kernel.drawing.readonly.selectedDrawingIds.peek()).toEqual([])
    chart.registerDrawingSession(null)
    await chart.destroy()
  })
  it('setDrawingTool writes DrawingToolId to kernel', async () => {
    const chart = new Chart(createDom(1000, 600), defaultOptions)
    expect(chart.kernel.drawing.readonly.drawingTool.peek()).toBe('cursor')
    chart.drawing.setTool('trend-line')
    expect(chart.kernel.drawing.readonly.drawingTool.peek()).toBe('trend-line')
    chart.drawing.setTool(null)
    expect(chart.kernel.drawing.readonly.drawingTool.peek()).toBe('cursor')
    await chart.destroy()
  })

  it('updateSettings writes kernel settings SSOT for renderer reads', async () => {
    const chart = new Chart(createDom(1000, 600), defaultOptions)
    chart.updateSettings({ showGridLines: false, mainRightAxisTypeSetting: 'log' })
    expect(chart.kernel.settings.readonly.settings.peek().showGridLines).toBe(false)
    expect(chart.kernel.settings.readonly.settings.peek().mainRightAxisTypeSetting).toBe('log')
    expect(chart['renderer'].getSettings().showGridLines).toBe(false)
    expect(chart['renderer'].getSettings().mainRightAxisTypeSetting).toBe('log')
    await chart.destroy()
  })

  it('updateSettings partial patch preserves prior keys', async () => {
    const chart = new Chart(createDom(1000, 600), defaultOptions)
    chart.updateSettings({ showGridLines: false })
    chart.updateSettings({ mainRightAxisTypeSetting: 'log' })
    expect(chart.kernel.settings.readonly.settings.peek().showGridLines).toBe(false)
    expect(chart.kernel.settings.readonly.settings.peek().mainRightAxisTypeSetting).toBe('log')
    await chart.destroy()
  })

  it('normalizes only visible panes in imported layout', async () => {
    const chart = new Chart(createDom(1000, 800), defaultOptions)
    chart.panes.importLayout([
      { id: 'main', ratio: 3, visible: true, role: 'price' },
      { id: 'sub_MACD', ratio: 1, visible: true, role: 'indicator' },
      { id: 'sub_RSI', ratio: 100, visible: false, role: 'indicator' },
    ])

    const specs = chart.panes.getLayoutSpecs()
    const main = specs.find((pane) => pane.id === 'main')
    const macd = specs.find((pane) => pane.id === 'sub_MACD')
    const rsi = specs.find((pane) => pane.id === 'sub_RSI')

    // 导入布局是显式快照替换，输入比例必须
    // be honoured (3:1 → 0.75:0.25 after visible normalization). Earlier this was
    // weakened to `main > macd` because syncPaneRatiosFromSpecs preserved a stale
    // 忽略上一帧 `main` 的 stale ratio。
    expect((main?.ratio ?? 0) + (macd?.ratio ?? 0)).toBeCloseTo(1, 6)
    expect(main?.ratio).toBeCloseTo(0.75, 6)
    expect(macd?.ratio).toBeCloseTo(0.25, 6)
    // Hidden pane preserves its incoming raw ratio (not normalized against visible);
    // it will be folded into the layout only if/when re-shown.
    expect(rsi?.visible).toBe(false)

    await chart.destroy()
  })
})
