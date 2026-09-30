// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDrawingMethods } from '@/controllers/chart/impl/createDrawingMethods'
import {
  FIVE_DAY_TIME_SHARE_PERIOD,
  type KLineData,
  type SymbolSpec,
  TIME_SHARE_PERIOD,
} from '@/controllers/types'
import { Chart, type ChartOptions } from '@/core/chart'
import {
  createChartDom,
  installChartDomStubs,
  ResizeObserverMock,
} from '@/engine/__tests__/helpers/chartDomTestKit'
import { PRICE_AXIS_RANGE_MODE } from '../../foundation/config/priceAxisRangeMode'
import { ScaleType } from '../../foundation/types/scaleType'
import { createDrawingAdapter, createTrendLine } from '../drawing/__tests__/helpers/drawingTestKit'
import { DrawingInteractionController, DrawingTool } from '../drawing/index'
import { getRegisteredIndicatorDefinition } from '../indicators/indicatorDefinitionRegistry'
import { loadBuiltinIndicators } from '../indicators/registerBuiltins'
import type { ChartModeHandler } from '../modes/types'
import { MAIN_PANE_ID } from '../paneIds'
import { ChartDataViewId } from '../state/modeState'
import { resolveViewTransition } from '../view/impl/resolveViewTransition'

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

function pointerEvent(
  type: string,
  target: HTMLElement,
  overrides: Partial<PointerEvent> = {},
): PointerEvent {
  return {
    type,
    clientX: 100,
    clientY: 40,
    isPrimary: true,
    pointerType: 'touch',
    pointerId: 1,
    target,
    ...overrides,
  } as PointerEvent
}

/** 用真实 Chart 文档和视口方法构造绘图会话，共享生产适配器而非测试替身。 */
function createChartDrawingSession(chart: Chart) {
  const methods = createDrawingMethods(chart, () => false)
  const adapter = { ...methods, getData: () => chart.getData() }
  const session = new DrawingInteractionController(adapter)
  chart.registerDrawingSession(session)
  return { adapter, session }
}

/** 构造测试用 Chart；尺寸与 runtime 可选，销毁由调用方负责。 */
function mountChart(
  width = 1000,
  height = 600,
  runtime?: ConstructorParameters<typeof Chart>[2],
): Chart {
  return new Chart(createChartDom(width, height), defaultOptions, runtime)
}

/** 生成均质 K 线序列；high/low 固定为 close ± 1。 */
function makeBars(count: number, close = 10): KLineData[] {
  return Array.from({ length: count }, (_, timestamp) => ({
    timestamp,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
  }))
}

/** 读取 Chart 的 K 线 / 分时模式处理器；私有成员访问集中在此。 */
function getModeHandlers(chart: Chart): { kLine: ChartModeHandler; timeShare: ChartModeHandler } {
  return { kLine: chart['_kLineMode'], timeShare: chart['_timeShareMode'] }
}

/** 触发一次 ResizeObserver 回调，可附带设备像素尺寸模拟 DPR 上报。 */
function emitResize(
  observer: ResizeObserverMock,
  size: { width: number; height: number; devicePixelWidth?: number; devicePixelHeight?: number },
): void {
  observer.emit({
    contentRect: DOMRect.fromRect({ width: size.width, height: size.height }),
    contentBoxSize: [{ inlineSize: size.width, blockSize: size.height }],
    ...(size.devicePixelWidth !== undefined && size.devicePixelHeight !== undefined
      ? {
          devicePixelContentBoxSize: [
            { inlineSize: size.devicePixelWidth, blockSize: size.devicePixelHeight },
          ],
        }
      : {}),
  })
}

describe('Chart DPR pipeline', () => {
  const comparison: SymbolSpec = {
    symbol: 'COMPARE',
    market: 'CN',
    source: 'chart-custom:default',
    period: 'daily',
    incremental: false,
  }

  /** 通过真实内联数据入口设置主品种，避免依赖外部行情 Provider。 */
  function setInlinePrimary(chart: Chart): void {
    chart.applyCustomData({ symbol: 'PRIMARY', market: 'CN', period: 'daily', data: [] })
  }
  const viewCases = [
    { period: 'daily', specs: [], view: ChartDataViewId.KLine, mode: ChartDataViewId.KLine },
    {
      period: 'daily',
      specs: [comparison],
      view: ChartDataViewId.Comparison,
      mode: ChartDataViewId.KLine,
    },
    {
      period: TIME_SHARE_PERIOD,
      specs: [],
      view: ChartDataViewId.TimeShare,
      mode: ChartDataViewId.TimeShare,
    },
    {
      period: TIME_SHARE_PERIOD,
      specs: [comparison],
      view: ChartDataViewId.TimeShare,
      mode: ChartDataViewId.TimeShare,
    },
    {
      period: FIVE_DAY_TIME_SHARE_PERIOD,
      specs: [],
      view: ChartDataViewId.FiveDayTimeShare,
      mode: ChartDataViewId.TimeShare,
    },
    {
      period: FIVE_DAY_TIME_SHARE_PERIOD,
      specs: [comparison],
      view: ChartDataViewId.FiveDayTimeShare,
      mode: ChartDataViewId.TimeShare,
    },
  ]

  it.each(viewCases)(
    'resolves $period and comparison specs=$specs consistently across entries',
    async ({ period, specs, view, mode }) => {
      const chart = mountChart()
      try {
        const decision = resolveViewTransition({ period, comparisonSpecs: specs })
        expect(decision.dataView).toBe(view)
        setInlinePrimary(chart)
        chart.setComparisonSpecs(specs)
        const activate = vi.spyOn(chart, 'setActiveMode')
        chart.setCurrentPeriod(period)
        expect(activate).toHaveBeenCalledOnce()
        expect(chart.kernel.mode.readonly.dataView.peek()).toBe(view)
        expect(chart.kernel.mode.readonly.chartMode.peek()).toBe(view)
        expect(chart.activeMode).toBe(
          mode === ChartDataViewId.TimeShare
            ? getModeHandlers(chart).timeShare
            : getModeHandlers(chart).kLine,
        )

        chart.setComparisonSpecs([])
        if (specs.length > 0) chart.comparisonCommands.add(comparison)
        expect(chart.kernel.mode.readonly.dataView.peek()).toBe(view)
        expect(chart.kernel.mode.readonly.chartMode.peek()).toBe(view)
        expect(chart.activeMode).toBe(
          mode === ChartDataViewId.TimeShare
            ? getModeHandlers(chart).timeShare
            : getModeHandlers(chart).kLine,
        )
        expect(chart.kernel.pane.readonly.paneScaleTypes.peek().get(MAIN_PANE_ID)).toBe(
          decision.timeShare || decision.comparison ? ScaleType.Percent : ScaleType.Linear,
        )
        activate.mockClear()
        chart.setSymbols([{ ...chart.symbols.peek()[0]!, period }])
        expect(activate).toHaveBeenCalledOnce()
        expect(chart.kernel.mode.readonly.dataView.peek()).toBe(view)
        chart.comparisonCommands.clear()
        expect(chart.kernel.mode.readonly.dataView.peek()).toBe(
          decision.timeShare ? view : ChartDataViewId.KLine,
        )
      } finally {
        await chart.destroy()
      }
    },
  )

  it('restores the configured scale after comparison → timeshare → comparison → K-line', async () => {
    const chart = mountChart()
    try {
      setInlinePrimary(chart)
      chart.updateSettings({ mainRightAxisTypeSetting: ScaleType.Log })
      chart.comparisonCommands.add(comparison)
      chart.setCurrentPeriod(TIME_SHARE_PERIOD)
      expect(chart.kernel.pane.readonly.paneScaleTypes.peek().get(MAIN_PANE_ID)).toBe(
        ScaleType.Percent,
      )
      chart.setCurrentPeriod('daily')
      expect(chart.kernel.mode.readonly.dataView.peek()).toBe(ChartDataViewId.Comparison)
      chart.comparisonCommands.clear()
      expect(chart.kernel.pane.readonly.paneScaleTypes.peek().get(MAIN_PANE_ID)).toBe(ScaleType.Log)
    } finally {
      await chart.destroy()
    }
  })

  it('commits timeshare geometry atomically and repaints slot-only changes', async () => {
    const chart = mountChart()
    try {
      setInlinePrimary(chart)
      chart.setCurrentPeriod(TIME_SHARE_PERIOD)
      const zoom = chart.kernel.zoom.readonly
      const observed: Array<{ width: number; slot: number | null }> = []
      const unsubscribe = zoom.kWidth.subscribe(() =>
        observed.push({ width: zoom.kWidth.peek(), slot: zoom.timeShareSlotWidth.peek() }),
      )
      const draw = vi.spyOn(chart, 'scheduleDraw')
      chart.applyRenderState({ kWidth: 4, slotWidth: 5 })
      expect(observed).toEqual([{ width: 4, slot: 5 }])
      expect(chart.kernel.viewport.readonly.kGap.peek()).toBe(1 / chart.getCurrentDpr())
      draw.mockClear()
      chart.applyRenderState({ kWidth: 4, slotWidth: 6 })
      expect(zoom.timeShareSlotWidth.peek()).toBe(6)
      expect(draw).toHaveBeenCalledOnce()
      draw.mockClear()
      chart.applyRenderState({ kWidth: 4, slotWidth: 6 })
      expect(draw).not.toHaveBeenCalled()
      chart.applyRenderState({ kWidth: 5, slotWidth: 3 })
      expect(zoom.kWidth.peek()).toBe(4)
      expect(zoom.timeShareSlotWidth.peek()).toBe(6)
      unsubscribe()
    } finally {
      await chart.destroy()
    }
  })

  it('rejects multiple primary symbols and clears a timeshare primary explicitly', async () => {
    const chart = mountChart()
    try {
      setInlinePrimary(chart)
      chart.setCurrentPeriod(TIME_SHARE_PERIOD)
      const before = chart.symbols.peek()
      expect(() => chart.setSymbols([...before, comparison])).toThrow(RangeError)
      expect(chart.symbols.peek()).toBe(before)
      chart.setSymbols([])
      expect(chart.symbols.peek()).toEqual([])
      expect(chart.kernel.mode.readonly.dataView.peek()).toBe(ChartDataViewId.KLine)
    } finally {
      await chart.destroy()
    }
  })

  it('filters options without mutating a frozen caller object', async () => {
    const chart = mountChart()
    try {
      const patch = Object.freeze({ kWidth: 99, kGap: 98, yPaddingPx: 7 })
      chart.updateOptions(patch)
      expect(patch).toEqual({ kWidth: 99, kGap: 98, yPaddingPx: 7 })
      expect(chart.getOption().yPaddingPx).toBe(7)
      expect(chart.kernel.zoom.readonly.kWidth.peek()).not.toBe(99)
    } finally {
      await chart.destroy()
    }
  })

  it('uses the custom-data comparison snapshot to select its view', async () => {
    const chart = mountChart()
    try {
      chart.applyCustomData({
        symbol: 'PRIMARY',
        market: 'CN',
        period: 'daily',
        data: [],
        comparisons: { COMPARE: [] },
      })
      expect(chart.kernel.mode.readonly.dataView.peek()).toBe(ChartDataViewId.Comparison)
      chart.applyCustomData({ symbol: 'PRIMARY', market: 'CN', period: 'daily', data: [] })
      expect(chart.kernel.mode.readonly.dataView.peek()).toBe(ChartDataViewId.KLine)
      expect(chart.interactionState).toBe(chart.kernel.interaction.readonly.interactionSnapshot)
    } finally {
      await chart.destroy()
    }
  })

  it('skips unchanged frames and repaints only overlay on pointer movement', async () => {
    const dom = createChartDom(1000, 600)
    const chart = new Chart(dom, defaultOptions)
    chart.resize()
    chart.setData(makeBars(100))
    const paint = vi.spyOn(chart['renderer'].getScene(), 'paint')
    const instances = vi.spyOn(chart['rendererHost'].renderer, 'drawInstances')
    const lines = vi.spyOn(chart['rendererHost'].renderer, 'drawLines')
    chart.draw()
    paint.mockClear()
    instances.mockClear()
    lines.mockClear()
    chart.draw()
    expect(paint).not.toHaveBeenCalled()
    expect(instances).not.toHaveBeenCalled()
    expect(lines).not.toHaveBeenCalled()

    chart.handlePointerEvent(pointerEvent('pointermove', dom.container, { pointerType: 'mouse' }))
    chart.draw()
    expect(paint).toHaveBeenCalled()
    expect(
      paint.mock.lastCall?.[0].panes.every((pane) =>
        pane.roles?.every((role) => role === 'drawing' || role === 'overlay'),
      ),
    ).toBe(true)
    expect(instances).not.toHaveBeenCalled()

    paint.mockClear()
    chart.kernel.viewport.actions.scrollTo(30)
    chart.draw()
    expect(paint.mock.lastCall?.[0].panes.some((pane) => pane.roles?.includes('primary'))).toBe(
      true,
    )
    await chart.destroy()
  })

  it('invalidates main content for data, zoom, settings, resize and DPR changes', async () => {
    const chart = mountChart()
    const bars = makeBars(100)
    chart.resize()
    chart.setData(bars)
    chart.draw()
    const paint = vi.spyOn(chart['renderer'].getScene(), 'paint')
    const expectMainPaint = (reason: string) => {
      paint.mockClear()
      chart.draw()
      expect(
        paint.mock.lastCall?.[0].panes.some((pane) => pane.roles?.includes('primary')),
        reason,
      ).toBe(true)
    }

    chart.setData([...bars, { timestamp: 100, open: 11, high: 12, low: 10, close: 11 }])
    expectMainPaint('data')
    chart.applyRenderState({ zoomLevel: 2 })
    expectMainPaint('zoom')
    chart.updateSettings({ showGridLines: false })
    expectMainPaint('settings')
    chart.resize()
    expectMainPaint('resize')
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 })
    emitResize(ResizeObserverMock.instances[0]!, {
      width: 1000,
      height: 600,
      devicePixelWidth: 2000,
      devicePixelHeight: 1200,
    })
    expect(chart.getCurrentDpr()).toBe(2)
    expectMainPaint('DPR')
    await chart.destroy()
  })

  /** 真实交互会话逐帧更新临时坐标，正式表面复用，并在提交或取消后恢复图元。 */
  it.each(['commit', 'cancel'] as const)(
    'repaints drag frames independently and restores the committed layer on %s',
    async (finish) => {
      const dom = createChartDom(1000, 600)
      const chart = new Chart(dom, defaultOptions)
      try {
        chart.resize()
        chart.setData(makeBars(100))
        const { adapter, session } = createChartDrawingSession(chart)
        const drawing = createTrendLine('dragged', {
          paneId: MAIN_PANE_ID,
          anchors: [
            { id: 'start', time: 40, price: 10 },
            { id: 'end', time: 60, price: 10 },
          ],
          locked: false,
        })
        chart.drawing.setDrawings([
          drawing,
          {
            ...drawing,
            id: 'stationary',
            anchors: drawing.anchors.map((anchor) => ({ ...anchor, price: 9.5 })),
          },
          {
            ...drawing,
            id: 'fixed',
            anchors: drawing.anchors.map((anchor) => ({ ...anchor, price: 10.5 })),
          },
        ])
        chart.drawing.setSelectedIds(['dragged', 'stationary'])
        chart.draw()
        // 点选线身会维持多选，整组图元进入会话层。
        const x = adapter.getScreenXAtLogicalIndex(50)
        if (x === null) throw new Error('Expected a visible drawing midpoint')
        const y = adapter.priceToY(MAIN_PANE_ID, 10)
        const event = (type: string, dy = 0) =>
          pointerEvent(type, dom.container, {
            pointerType: 'mouse',
            clientX: x,
            clientY: y + dy,
            button: 0,
          })
        const scene = chart['renderer'].getScene()
        const formalLayer = scene.layers.peek().find((layer) => layer.role === 'drawing')
        if (!formalLayer) throw new Error('Expected the committed drawing layer')
        const formalPaint = vi.spyOn(formalLayer, 'paint')
        const instances = vi.spyOn(chart['rendererHost'].renderer, 'drawInstances')
        const committed = chart.drawing.drawings.peek()
        expect(session.onPointerDown(event('pointerdown'), dom.container)).toBe(true)
        expect(session.onPointerMove(event('pointermove', 20), dom.container)).toBe(true)
        chart.draw()
        expect(formalPaint).toHaveBeenCalledOnce()
        const first = chart['renderer'].getPaneCtxMap().get(MAIN_PANE_ID)
        expect(first?.drawingProjection?.primitives.length).toBeGreaterThan(0)
        expect(first?.sessionDrawingProjection?.primitives.length).toBeGreaterThan(0)
        formalPaint.mockClear()
        instances.mockClear()
        expect(session.onPointerMove(event('pointermove', 40), dom.container)).toBe(true)
        chart.draw()
        const second = chart['renderer'].getPaneCtxMap().get(MAIN_PANE_ID)
        expect(second?.sessionDrawingProjection).not.toEqual(first?.sessionDrawingProjection)
        expect(second?.drawingProjection).toBe(first?.drawingProjection)
        expect(formalPaint).not.toHaveBeenCalled()
        expect(instances).not.toHaveBeenCalled()
        expect(chart.drawing.drawings.peek()).toBe(committed)

        if (finish === 'commit') session.onPointerUp(event('pointerup', 40), dom.container)
        else session.cancelPendingChanges()
        chart.draw()
        expect(formalPaint).toHaveBeenCalledOnce()
        const final = chart['renderer'].getPaneCtxMap().get(MAIN_PANE_ID)
        expect(final?.sessionDrawingProjection?.primitives).toHaveLength(0)
        expect(final?.drawingProjection?.primitives.length).toBeGreaterThan(0)
        expect(chart.drawing.drawings.peek() === committed).toBe(finish === 'cancel')
      } finally {
        await chart.destroy()
      }
    },
  )

  /** 正式投影复用时保留选中图元的轴标签，预览变化仍能触发帧提交。 */
  it('repaints preview changes and retains committed axis decorations', async () => {
    const dom = createChartDom(1000, 600)
    const chart = new Chart(dom, defaultOptions)
    try {
      chart.resize()
      chart.setData(makeBars(100))
      const { adapter, session } = createChartDrawingSession(chart)
      session.setTool(DrawingTool.TrendLine)
      chart.drawing.setDrawings([
        createTrendLine('selected', {
          paneId: MAIN_PANE_ID,
          anchors: [
            { id: 'start', time: 40, price: 10 },
            { id: 'end', time: 60, price: 10 },
          ],
          locked: false,
        }),
      ])
      chart.drawing.setSelectedIds(['selected'])
      chart.draw()
      const x = adapter.getScreenXAtLogicalIndex(50)
      if (x === null) throw new Error('Expected a visible preview position')
      const y = adapter.priceToY(MAIN_PANE_ID, 10)
      expect(
        session.onPointerDown(
          pointerEvent('pointerdown', dom.container, {
            pointerType: 'mouse',
            clientX: x,
            clientY: y,
            button: 0,
          }),
          dom.container,
        ),
      ).toBe(true)
      const move = (dy: number) =>
        session.onPointerMove(
          pointerEvent('pointermove', dom.container, {
            pointerType: 'mouse',
            clientX: x,
            clientY: y + dy,
          }),
          dom.container,
        )
      expect(move(20)).toBe(true)
      chart.draw()
      const first = chart['renderer'].getPaneCtxMap().get(MAIN_PANE_ID)
      expect(move(40)).toBe(true)
      chart.draw()
      const second = chart['renderer'].getPaneCtxMap().get(MAIN_PANE_ID)
      expect(second?.drawingProjection).toBe(first?.drawingProjection)
      expect(second?.sessionDrawingProjection).not.toEqual(first?.sessionDrawingProjection)
      expect(second?.axisLabels.forSurface('yRightOverlay', MAIN_PANE_ID).labels).toEqual(
        first?.axisLabels.forSurface('yRightOverlay', MAIN_PANE_ID).labels,
      )
      expect(second?.axisLabels.forSurface('xLabels').labels).toEqual(
        first?.axisLabels.forSurface('xLabels').labels,
      )
    } finally {
      await chart.destroy()
    }
  })

  it('keeps the crosshair visible while drawing preview consumes mouse moves', async () => {
    const dom = createChartDom(1000, 600)
    const chart = new Chart(dom, defaultOptions)
    chart.resize()
    chart.setData(makeBars(100))
    chart.drawing.setTool('trend-line')
    chart.draw()

    const handled = chart.handlePointerEvent(
      pointerEvent('pointermove', dom.container, { pointerType: 'mouse' }),
      { onPointerMove: () => true },
    )
    chart.draw()
    expect(handled).toBe(true)
    expect(chart.interaction.crosshairPos).not.toBeNull()
    await chart.destroy()
  })

  it('checks history only after the last pinch pointer is lifted, not on leave or render', async () => {
    const dom = createChartDom(1000, 600)
    dom.container.setPointerCapture = () => {}
    dom.container.hasPointerCapture = () => false
    dom.container.releasePointerCapture = () => {}
    const chart = new Chart(dom, defaultOptions)
    chart.resize()
    const check = vi.spyOn(chart, 'checkVisibleRangeGap').mockImplementation(() => {})
    const first = pointerEvent('pointerdown', dom.container)
    const second = pointerEvent('pointerdown', dom.container, {
      clientX: 200,
      isPrimary: false,
      pointerId: 2,
    })

    chart.handlePointerEvent(first)
    chart.handlePointerEvent(second)
    chart.handlePointerEvent(pointerEvent('pointerleave', dom.container))
    chart.draw()
    expect(check).not.toHaveBeenCalled()

    chart.handlePointerEvent(pointerEvent('pointerup', dom.container))
    expect(check).not.toHaveBeenCalled()
    chart.handlePointerEvent(
      pointerEvent('pointerup', dom.container, {
        isPrimary: false,
        pointerId: 2,
      }),
    )
    expect(check).toHaveBeenCalledOnce()
    await chart.destroy()
  })

  it('checks after mouse pointerup and wheel zoom, but never during a held pointer', async () => {
    const dom = createChartDom(1000, 600)
    dom.container.setPointerCapture = () => {}
    dom.container.hasPointerCapture = () => false
    dom.container.releasePointerCapture = () => {}
    const chart = new Chart(dom, defaultOptions)
    chart.resize()
    const check = vi.spyOn(chart, 'checkVisibleRangeGap').mockImplementation(() => {})
    const mouse = { pointerType: 'mouse' }

    chart.handlePointerEvent(pointerEvent('pointerdown', dom.container, mouse))
    chart.handleWheelEvent({ deltaY: -1, clientX: 100 } as WheelEvent)
    chart.draw()
    expect(check).not.toHaveBeenCalled()

    chart.handlePointerEvent(pointerEvent('pointerup', dom.container, mouse))
    expect(check).toHaveBeenCalledOnce()
    chart.handleWheelEvent({ deltaY: -1, clientX: 100 } as WheelEvent)
    expect(check).toHaveBeenCalledTimes(2)
    await chart.destroy()
  })

  it('checks the viewport after an external DOM scroll while idle', async () => {
    const dom = createChartDom(1000, 600)
    const chart = new Chart(dom, defaultOptions)
    chart.resize()
    chart.setData(makeBars(200))
    const check = vi.spyOn(chart, 'checkVisibleRangeGap').mockImplementation(() => {})
    dom.container.scrollLeft = 900
    chart.handleScrollEvent()
    expect(check).toHaveBeenCalledOnce()
    await chart.destroy()
  })

  let restoreChartDomStubs: () => void

  it.each([ScaleType.Linear, ScaleType.Log, ScaleType.Percent])(
    'fits a fresh price range on every symbol switch after manual scaling (%s)',
    async (scaleType) => {
      const chart = mountChart(1000, 600, {
        initialSettings: {
          mainPriceAxisRangeMode: PRICE_AXIS_RANGE_MODE.HAND,
          mainRightAxisTypeSetting: scaleType,
        },
      })
      try {
        chart.resize()
        chart.applyCustomData({
          symbol: 'PRIMARY',
          market: 'CN',
          period: 'daily',
          data: makeBars(200),
        })
        chart.draw()
        const primary = chart.symbols.peek()[0]!
        const axis = chart.getPaneRenderers()[0]!.getPane().yAxis
        const initialRange = axis.getDisplayRange()
        chart.scalePrice(MAIN_PANE_ID, -100)
        chart.translatePrice(MAIN_PANE_ID, 80)
        chart.draw()
        expect(axis.getDisplayRange()).not.toEqual(initialRange)

        chart.applyCustomData({
          symbol: 'SECONDARY',
          market: 'CN',
          period: 'daily',
          data: makeBars(200, 100),
        })
        // 新品种尚未绘制时，旧轴上的交互不能提前初始化其锁定范围。
        chart.scalePrice(MAIN_PANE_ID, -100)
        chart.translatePrice(MAIN_PANE_ID, 80)
        expect(chart.kernel.mainPriceAxis.readonly.handRange.peek()).toBeNull()
        chart.draw()
        expect(axis.getDisplayRange().minPrice).toBeCloseTo(99)
        expect(axis.getDisplayRange().maxPrice).toBeCloseTo(101)
        expect(axis.getVerticalScale()).toBe(1)
        expect(axis.getPriceOffset()).toBe(0)
        expect(axis.priceToY(101)).toBeGreaterThanOrEqual(0)
        expect(axis.priceToY(99)).toBeLessThanOrEqual(chart.getPaneRenderers()[0]!.getPane().height)

        const secondaryRange = axis.getDisplayRange()
        chart.kernel.viewport.actions.scrollTo(0)
        chart.draw()
        expect(axis.getDisplayRange()).toEqual(secondaryRange)

        chart.scalePrice(MAIN_PANE_ID, -100)
        chart.draw()
        chart.setSymbols([primary])
        chart.draw()
        expect(axis.getDisplayRange().minPrice).toBeCloseTo(initialRange.minPrice)
        expect(axis.getDisplayRange().maxPrice).toBeCloseTo(initialRange.maxPrice)
        expect(chart.kernel.mainPriceAxis.readonly.rangeMode.peek()).toBe(
          PRICE_AXIS_RANGE_MODE.HAND,
        )
      } finally {
        await chart.destroy()
      }
    },
  )

  beforeAll(async () => {
    await loadBuiltinIndicators()
  })

  beforeEach(() => {
    restoreChartDomStubs = installChartDomStubs()
  })

  afterEach(() => {
    restoreChartDomStubs()
    vi.restoreAllMocks()
  })

  it('mounts renderer layers for restored sub-pane indicators', async () => {
    const chart = mountChart(1000, 600, {
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

    const rsiRendererName = getRegisteredIndicatorDefinition('RSI')?.getRendererName({
      paneId: 'RSI_0',
      indicatorId: 'RSI',
    })
    expect(rsiRendererName).toBeDefined()
    expect(chart.getRenderer(rsiRendererName!)).toBeDefined()
    await chart.destroy()
  })

  it('registers the latest price line and label layers and follows the data view', async () => {
    const chart = mountChart()
    const scene = chart['renderer'].getScene()
    for (const name of ['lastPriceLine', 'lastPriceLabelRegistrar']) {
      expect(chart.getRenderer(name)).toBeDefined()
      expect(scene.getLayer(`plugin:${name}`)).toBeDefined()
      expect(chart.getRenderer(name)?.role).toBe('overlay')
    }

    chart['kernel'].actions.setDataView('timeshare')
    expect(scene.getLayer('plugin:lastPriceLine')?.visible).toBe(false)
    expect(scene.getLayer('plugin:lastPriceLabelRegistrar')?.visible).toBe(false)

    chart['kernel'].actions.setDataView('kline')
    expect(scene.getLayer('plugin:lastPriceLine')?.visible).toBe(true)
    expect(scene.getLayer('plugin:lastPriceLabelRegistrar')?.visible).toBe(true)
    await chart.destroy()
  })

  it('falls back to default observe when device-pixel-content-box observe fails', async () => {
    ResizeObserverMock.failWithDevicePixelBox = true
    const chart = mountChart()

    const ro = ResizeObserverMock.instances[0]
    expect(ro).toBeDefined()
    expect(ro?.observe).toHaveBeenCalledTimes(2)
    expect(ro?.observe).toHaveBeenNthCalledWith(1, chart.getDom().container, {
      box: 'device-pixel-content-box',
    })
    expect(ro?.observe).toHaveBeenNthCalledWith(2, chart.getDom().container)

    await chart.destroy()
  })

  const dprCases = [
    {
      name: 'prefers the precise device-pixel box size',
      ratio: 1,
      devicePixel: [2000, 1200] as const,
      expected: 2,
    },
    {
      name: 'rounds window.devicePixelRatio when the precise box is unavailable',
      ratio: 1.234,
      expected: Math.round(1.234 * 64) / 64,
    },
    { name: 'clamps to at least 1', ratio: 0.5, expected: 1 },
  ]

  it.each(dprCases)('derives DPR: $name', async ({ ratio, devicePixel, expected }) => {
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      writable: true,
      value: ratio,
    })

    const chart = mountChart()
    emitResize(ResizeObserverMock.instances[0]!, {
      width: 1000,
      height: 600,
      devicePixelWidth: devicePixel?.[0],
      devicePixelHeight: devicePixel?.[1],
    })

    expect(chart.getCurrentDpr()).toBe(expected)

    await chart.destroy()
  })

  it('reduces viewport DPR when requested pixels exceed MAX_CANVAS_PIXELS', async () => {
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      writable: true,
      value: 3,
    })

    const chart = mountChart(6000, 4000)
    chart.resize()

    const viewport = chart.getViewport()
    expect(viewport).not.toBeNull()
    expect(viewport!.dpr).toBeLessThan(3)

    await chart.destroy()
  })

  it('disconnects ResizeObserver on destroy', async () => {
    const chart = mountChart()
    const ro = ResizeObserverMock.instances[0]

    await chart.destroy()

    expect(ro?.disconnect).toHaveBeenCalledTimes(1)
  })

  it('does not emit viewport change on draw when viewport is unchanged', async () => {
    const chart = mountChart()
    const onViewportChange = vi.fn()

    chart.viewport.subscribe(onViewportChange)
    chart.draw()
    chart.draw()

    // draw 只读 viewport，不写 signal
    expect(onViewportChange).toHaveBeenCalledTimes(0)

    await chart.destroy()
  })

  it('publishes each DOM scroll position before scheduling its frame', async () => {
    const dom = createChartDom(1000, 600)
    const chart = new Chart(dom, defaultOptions)
    const data = makeBars(200)
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
    const chart = mountChart()
    const scheduleDrawSpy = vi.spyOn(chart, 'scheduleDraw')

    chart.applyRenderState({ zoomLevel: 2 })
    chart.applyRenderState({ zoomLevel: 2 })

    expect(scheduleDrawSpy).toHaveBeenCalledTimes(1)

    await chart.destroy()
  })

  it('routes custom markers through kernel and clears position cache', async () => {
    const chart = mountChart()
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
    const chart = mountChart()
    const store = chart.drawing.getStore()
    const scheduleDrawSpy = vi.spyOn(chart, 'scheduleDraw')
    const drawing = createTrendLine('d1')

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
    const chart = mountChart()
    const commitSpy = vi.spyOn(chart.kernel.pane.actions, 'commitLayout')
    commitSpy.mockClear()

    const layout = chart['layoutManager']
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
  let restoreChartDomStubs: () => void

  beforeEach(() => {
    restoreChartDomStubs = installChartDomStubs()
  })

  afterEach(() => {
    restoreChartDomStubs()
    vi.restoreAllMocks()
  })

  it('allocates initial pane ratios as 3:1:1 for main+MACD+RSI', async () => {
    const chart = mountChart()
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
    const chart = mountChart()
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
    const chart = mountChart(1000, 800)
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
    const chart = mountChart()
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

  it('projects the price axis scale from settings and data view', async () => {
    const chart = mountChart()
    chart.resize()
    chart.updateSettings({ mainRightAxisTypeSetting: 'log' })
    expect(chart.kernel.pane.readonly.paneScaleTypes.peek().get('main')).toBe('log')
    expect(chart.getPaneRenderers()[0]?.getPane().yAxis.getScaleType()).toBe('log')

    // 新建子图从设置播种刻度类型并投影。
    expect(chart.panes.create({ paneId: 'MACD_0', indicatorId: 'MACD', params: {} })).toBe(true)
    expect(chart.kernel.pane.readonly.paneScaleTypes.peek().get('MACD_0')).toBe('log')
    const macd = chart
      .getPaneRenderers()
      .find((r) => r.getPane().id === 'MACD_0')
      ?.getPane()
    expect(macd?.yAxis.getScaleType()).toBe('log')

    // 分时视图强制主图 percent，覆盖设置里的 log。
    chart.setActiveMode(getModeHandlers(chart).timeShare)
    expect(chart.kernel.pane.readonly.paneScaleTypes.peek().get('main')).toBe('percent')
    expect(chart.getPaneRenderers()[0]?.getPane().yAxis.getScaleType()).toBe('percent')
    expect(chart.kernel.mode.readonly.dataView.peek()).toBe('timeshare')
    await chart.destroy()
  })

  it('clears stale canvases and cached geometry when switching data views', async () => {
    const chart = mountChart()
    const renderer = chart['renderer']
    const clearCanvases = vi.spyOn(renderer, 'clearAllCanvases')
    const clearCachedFrame = vi.spyOn(renderer, 'clearCachedFrame')
    const setLegendContext = vi.spyOn(chart['_legendTemplateContext'], 'set')

    chart.setActiveMode(getModeHandlers(chart).timeShare)

    expect(clearCanvases).toHaveBeenCalledOnce()
    expect(clearCachedFrame).toHaveBeenCalledOnce()
    expect(setLegendContext).toHaveBeenCalledWith(null)
    expect(chart.legendTemplateContext.peek()).toBeNull()
    await chart.destroy()
  })

  it('timeshare switching preserves independent indicator workspaces and layouts', async () => {
    const chart = mountChart()
    chart.resize()
    expect(chart.indicators.enableMain('MA')).toBe(true)
    expect(chart.panes.create({ paneId: 'MACD_0', indicatorId: 'MACD', params: {} })).toBe(true)
    expect(chart.panes.create({ paneId: 'RSI_0', indicatorId: 'RSI', params: {} })).toBe(true)
    const ratiosBefore = { ...chart.kernel.pane.readonly.paneRatios.peek() }
    const entriesBefore = chart.indicators.subPanes.peek().map((e) => ({
      paneId: e.paneId,
      indicatorId: e.indicatorId,
    }))

    const tsMode = getModeHandlers(chart).timeShare
    const kMode = getModeHandlers(chart).kLine
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
      chart.indicators.subPanes
        .peek()
        .map((e) => ({ paneId: e.paneId, indicatorId: e.indicatorId })),
    ).toEqual(timeShareEntries)
    await chart.destroy()
  })

  it('timeshare does not reuse a K-line volume pane', async () => {
    const chart = mountChart()
    chart.resize()
    const volumePaneId = chart.indicators.add('VOL', 'sub')
    expect(volumePaneId).not.toBeNull()
    const tsMode = getModeHandlers(chart).timeShare
    const kMode = getModeHandlers(chart).kLine

    chart.setActiveMode(tsMode)
    expect(chart.indicators.subPanes.peek()).toEqual([])
    const timeShareVolumePaneId = chart.indicators.add('VOL', 'sub')
    expect(timeShareVolumePaneId).not.toBeNull()

    chart.setActiveMode(kMode)
    expect(chart.indicators.subPanes.peek()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ instanceId: volumePaneId, indicatorId: 'VOL' }),
      ]),
    )
    chart.setActiveMode(tsMode)
    expect(chart.indicators.subPanes.peek()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ instanceId: timeShareVolumePaneId, indicatorId: 'VOL' }),
      ]),
    )
    await chart.destroy()
  })

  it('removeDrawing drops id from kernel and clears selection', async () => {
    const chart = mountChart()
    const d1 = createTrendLine('d1', { style: { stroke: '#f00' } })
    const d2 = createTrendLine('d2', { style: { stroke: '#f00' } })
    chart.drawing.setDrawings([d1, d2])
    chart.drawing.setSelectedIds(['d1'])
    chart.drawing.remove('d1')
    expect(chart.kernel.drawing.readonly.drawings.peek().map((d) => d.id)).toEqual(['d2'])
    expect(chart.kernel.drawing.readonly.selectedDrawingIds.peek()).toEqual([])
    expect(chart.undoDrawing()).toBe(true)
    expect(chart.drawing.drawings.peek().map((d) => d.id)).toEqual(['d1', 'd2'])
    expect(chart.drawing.selectedIds.peek()).toEqual(['d1'])
    expect(chart.redoDrawing()).toBe(true)
    expect(chart.drawing.drawings.peek().map((d) => d.id)).toEqual(['d2'])
    await chart.destroy()
  })

  it('removeDrawing with registered session updates kernel only', async () => {
    const chart = mountChart()
    const d1 = createTrendLine('d1', { style: { stroke: '#f00' } })
    const d2 = createTrendLine('d2', { style: { stroke: '#f00' } })
    chart.drawing.setDrawings([d1, d2])
    chart.drawing.setSelectedIds(['d1'])

    const adapter = createDrawingAdapter({
      document: {
        replaceDrawings: (list) => chart.drawing.setDrawings([...list]),
        getFullDrawings: () => [...chart.kernel.drawing.readonly.drawings.peek()],
        createDrawing: () => d1,
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
    const chart = mountChart()
    expect(chart.kernel.drawing.readonly.drawingTool.peek()).toBe('cursor')
    chart.drawing.setTool('trend-line')
    expect(chart.kernel.drawing.readonly.drawingTool.peek()).toBe('trend-line')
    chart.drawing.setTool(null)
    expect(chart.kernel.drawing.readonly.drawingTool.peek()).toBe('cursor')
    await chart.destroy()
  })

  it('merges settings patches, keeps them in kernel SSOT and exposes them to the renderer', async () => {
    const chart = mountChart()
    chart.updateSettings({ showGridLines: false })
    chart.updateSettings({ mainRightAxisTypeSetting: 'log' })
    const settings = chart.kernel.settings.readonly.settings.peek()
    expect(settings.showGridLines).toBe(false)
    expect(settings.mainRightAxisTypeSetting).toBe('log')
    expect(chart['renderer'].getSettings().showGridLines).toBe(false)
    expect(chart['renderer'].getSettings().mainRightAxisTypeSetting).toBe('log')
    await chart.destroy()
  })

  it('normalizes only visible panes in imported layout', async () => {
    const chart = mountChart(1000, 800)
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
