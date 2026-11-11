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
        const targets: import('../pane/types').InstanceMoveTarget[] = [
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
            expect(chart.panes.hasPane(before.paneId)).toBe(false)
          if (target.kind === 'newPane') {
            const ids = chart.panes.getLayoutSpecs().map((spec) => spec.id)
            expect(ids.indexOf(current.paneId) - ids.indexOf(MAIN_PANE_ID)).toBe(
              target.placement === 'above' ? -1 : 1,
            )
          }
          chart.draw()
        }
        expect(chart.panes.updateInstance(instanceId, { hidden: true })).toBe(true)
        expect(
          chart.getRenderer(
            resolveIndicatorLayerId(definitionId, MAIN_PANE_ID, 'renderer', instanceId),
          ),
        ).toBeUndefined()
        expect(chart.legend.moveTo(instanceId, { kind: 'pane', paneId: targetPaneId })).toBe(true)
        expect(
          chart.panes.updateInstance(instanceId, { hidden: false, params: { custom: 9 } }),
        ).toBe(true)
        const finalId = resolveIndicatorLayerId(definitionId, targetPaneId, 'renderer', instanceId)
        expect(chart.getRenderer(finalId)?.pane).toBe(targetPaneId)
        expect(chart.panes.removeInstance(instanceId)).toBe(true)
        expect(chart.getRenderer(finalId)).toBeUndefined()
        expect(chart.panes.hasPane(targetPaneId)).toBe(true)
      } finally {
        await chart.destroy()
      }
    },
  )

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
