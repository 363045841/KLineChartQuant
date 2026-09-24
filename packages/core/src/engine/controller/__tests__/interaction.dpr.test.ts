// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import { InteractionController } from '@/core/controller/interaction'
import { writableRef } from '@/foundation/reactivity/signal'
import { type ChartDataView, ChartDataViewId } from '@/foundation/types/chartView'
import type { KLineData } from '@/types/price'
import { createInteractionState } from '../../state/interactionState'

/** 交互内核替身：直接复用生产实现，测试不再手抄 snapshot 字段。 */
function createMockInteractionState() {
  return createInteractionState({
    visibleRange$: writableRef({ start: 0, end: 0 }),
    scrollLeftLogical$: writableRef(0),
    dpr$: writableRef(1),
    scheduleDraw: () => {},
  })
}

function createChartStub(args: {
  dpr: number
  plotWidth: number
  plotHeight: number
  paneByY?: Array<{
    id: string
    top: number
    height: number
    candleHitTest: boolean
  }>
  markerManager?: {
    hitTest: (worldX: number, y: number, radius: number) => any
    setHover: (id: string | null) => void
    hitTestCustomMarker: (x: number, y: number) => any
  }
  dataView?: ChartDataView
  scrollTo?: (value: number) => boolean
  scheduleDraw?: () => void
}) {
  const container = document.createElement('div') as HTMLDivElement
  Object.defineProperty(container, 'scrollLeft', { configurable: true, writable: true, value: 0 })
  Object.defineProperty(container, 'clientWidth', { configurable: true, value: 320 })
  Object.defineProperty(container, 'clientHeight', { configurable: true, value: 200 })
  Object.defineProperty(container, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 0, top: 0, width: 320, height: 200 }),
  })
  container.setPointerCapture = () => undefined
  container.hasPointerCapture = () => false
  container.releasePointerCapture = () => undefined

  const data: KLineData[] = [
    {
      timestamp: 20260101,
      open: 10,
      high: 12,
      low: 8,
      close: 11,
      volume: 1000,
    },
    {
      timestamp: 20260102,
      open: 11,
      high: 13,
      low: 9,
      close: 12,
      volume: 1200,
    },
  ]

  const paneDefs = args.paneByY ?? [{ id: 'main', top: 0, height: 160, candleHitTest: true }]
  const paneRenderers = paneDefs.map((paneDef) => ({
    getPane: () => ({
      id: paneDef.id,
      top: paneDef.top,
      height: paneDef.height,
      capabilities: {
        showPriceAxisTicks: true,
        showCrosshairPriceLabel: true,
        candleHitTest: paneDef.candleHitTest,
        supportsPriceTranslate: true,
      },
      yAxis: {
        yToPrice: (y: number) => y,
        priceToY: (p: number) => p,
        getPaddingTop: () => 0,
        getPaddingBottom: () => 0,
        getPriceOffset: () => 0,
      },
    }),
  }))

  const markerManager =
    args.markerManager ??
    ({
      hitTest: () => null,
      setHover: () => undefined,
      hitTestCustomMarker: () => null,
    } as const)

  const rightAxisLayer = document.createElement('div') as HTMLDivElement

  const chart = {
    getDom: () => ({ container, rightAxisLayer }),
    viewport: {
      peek: () => ({
        zoomLevel: 1,
        plotWidth: args.plotWidth,
        plotHeight: args.plotHeight,
        dpr: args.dpr,
        visibleFrom: 0,
        visibleTo: 2,
        kWidth: 6,
        kGap: 2,
      }),
    },
    getViewport: () => ({
      viewWidth: 320,
      viewHeight: 200,
      plotWidth: args.plotWidth,
      plotHeight: args.plotHeight,
      scrollLeft: 0,
      dpr: args.dpr,
    }),
    getCurrentDpr: () => args.dpr,
    kernel: {
      viewport: {
        readonly: {
          scrollLeft: { peek: () => 0 },
          scrollLeftLogical: { peek: () => 0 },
          maxScrollLeft: { peek: () => 1_000 },
        },
        actions: {
          scrollTo: args.scrollTo ?? (() => false),
        },
      },
      settings: {
        readonly: {
          settings: { peek: () => ({}) },
        },
      },
      mode: {
        readonly: {
          dataView: { peek: () => args.dataView ?? ChartDataViewId.KLine },
          interactionCapabilities: { peek: () => ({ allowPan: true }) },
        },
      },
    },
    markers: { getManager: () => markerManager },
    getPaneRenderers: () => paneRenderers,
    getData: () => data,
    getRenderData: () => data,
    getInternalData: () => data,
    currentPeriod: 'daily',
    handlePinchZoom: () => undefined,
    translatePrice: () => undefined,
    updateDrawingHover: () => undefined,
    clearDrawingHover: () => undefined,
    scheduleDraw: args.scheduleDraw ?? (() => undefined),
    zoomAt: () => undefined,
    resetPriceOffset: () => undefined,
    resetPriceTransform: () => undefined,
    panes: { resizeBoundary: () => false },
    scalePrice: () => undefined,
  }

  return chart
}

describe('InteractionController DPR consumption', () => {
  it('requests the shared render frame after a programmatic pan changes scroll state', () => {
    const scrollTo = vi.fn(() => true)
    const scheduleDraw = vi.fn()
    const chart = createChartStub({
      dpr: 1,
      plotWidth: 300,
      plotHeight: 160,
      scrollTo,
      scheduleDraw,
    })
    const interaction = new InteractionController(chart as never, createMockInteractionState())

    interaction.onPointerDown({
      clientX: 100,
      clientY: 40,
      isPrimary: true,
      pointerId: 1,
    } as PointerEvent)
    scheduleDraw.mockClear()
    interaction.onPointerMove({ clientX: 80, clientY: 40, isPrimary: true } as PointerEvent)

    expect(scrollTo).toHaveBeenCalledWith(20)
    expect(scheduleDraw).toHaveBeenCalledOnce()
  })

  it('hides hover while panning and restores it after mouse release', () => {
    const chart = createChartStub({ dpr: 1, plotWidth: 300, plotHeight: 160, scrollTo: () => true })
    const interaction = new InteractionController(chart as never, createMockInteractionState())
    interaction.setKLinePositions([0, 10], { start: 0, end: 2 }, 10)

    interaction.onPointerMove({ clientX: 50, clientY: 40, isPrimary: true } as PointerEvent)
    interaction.flushPendingHover()
    expect(interaction.crosshairPos).not.toBeNull()

    interaction.onPointerDown({
      clientX: 50,
      clientY: 40,
      isPrimary: true,
      pointerId: 1,
    } as PointerEvent)
    interaction.onPointerMove({ clientX: 30, clientY: 40, isPrimary: true } as PointerEvent)
    expect(interaction.crosshairPos).toBeNull()
    expect(interaction.hoveredIndex).toBeNull()

    interaction.onPointerUp({
      clientX: 30,
      clientY: 40,
      isPrimary: true,
      pointerId: 1,
    } as PointerEvent)
    // 渲染帧先封存平移后的几何，再用松手位置恢复 hover。
    interaction.setKLinePositions([20, 30], { start: 0, end: 2 }, 10)
    interaction.flushPendingHover()
    expect(interaction.crosshairPos).not.toBeNull()
    expect(interaction.hoveredIndex).not.toBeNull()
  })

  it('uses viewport plot bounds for hit boundary checks', () => {
    const chart = createChartStub({ dpr: 2, plotWidth: 100, plotHeight: 80 })
    const interaction = new InteractionController(chart as never, createMockInteractionState())

    interaction.setKLinePositions([0, 10], { start: 0, end: 2 }, 10)

    interaction.onPointerMove({ clientX: 50, clientY: 40, isPrimary: true } as PointerEvent)
    interaction.flushPendingHover()
    expect(interaction.crosshairPos).not.toBeNull()

    interaction.onPointerMove({ clientX: 120, clientY: 40, isPrimary: true } as PointerEvent)
    interaction.flushPendingHover()
    expect(interaction.crosshairPos).toBeNull()
    expect(interaction.crosshairIndex).toBeNull()
  })

  it('uses current DPR in kWidthLogical = kWidthPx / dpr path', () => {
    const chartDpr1 = createChartStub({ dpr: 1, plotWidth: 300, plotHeight: 160 })
    const interactionDpr1 = new InteractionController(
      chartDpr1 as never,
      createMockInteractionState(),
    )
    interactionDpr1.setKLinePositions([0, 10], { start: 0, end: 2 }, 10)

    interactionDpr1.onPointerMove({ clientX: 8, clientY: 40, isPrimary: true } as PointerEvent)
    interactionDpr1.flushPendingHover()
    expect(interactionDpr1.crosshairIndex).toBe(0)

    const chartDpr2 = createChartStub({ dpr: 2, plotWidth: 300, plotHeight: 160 })
    const interactionDpr2 = new InteractionController(
      chartDpr2 as never,
      createMockInteractionState(),
    )
    interactionDpr2.setKLinePositions([0, 10], { start: 0, end: 2 }, 10)

    interactionDpr2.onPointerMove({ clientX: 8, clientY: 40, isPrimary: true } as PointerEvent)
    interactionDpr2.flushPendingHover()
    expect(interactionDpr2.crosshairIndex).toBe(1)
  })

  it('uses sealed centers to select and snap the timeshare crosshair', () => {
    const chart = createChartStub({
      dpr: 1,
      plotWidth: 300,
      plotHeight: 160,
      dataView: ChartDataViewId.TimeShare,
    })
    const interaction = new InteractionController(chart as never, createMockInteractionState())

    // 分时 slot 间距可与 K 线物理宽度不同，不能从 position + width/2 推导中心。
    interaction.setKLinePositions([0, 10], { start: 0, end: 2 }, 10, [1, 21])
    interaction.onPointerMove({ clientX: 10, clientY: 40, isPrimary: true } as PointerEvent)
    interaction.flushPendingHover()

    expect(interaction.crosshairIndex).toBe(0)
    expect(interaction.crosshairPos?.x).toBe(1)
  })

  it('pointermove does not write crosshair until flushPendingHover', () => {
    const chart = createChartStub({ dpr: 1, plotWidth: 100, plotHeight: 80 })
    const interaction = new InteractionController(chart as never, createMockInteractionState())
    interaction.setKLinePositions([0, 10], { start: 0, end: 2 }, 10)

    interaction.onPointerMove({ clientX: 50, clientY: 40, isPrimary: true } as PointerEvent)
    expect(interaction.crosshairPos).toBeNull()

    interaction.flushPendingHover()
    expect(interaction.crosshairPos).not.toBeNull()
  })

  it('pointerleave cancels pending hover so flush does not restore crosshair', () => {
    const chart = createChartStub({ dpr: 1, plotWidth: 100, plotHeight: 80 })
    const interaction = new InteractionController(chart as never, createMockInteractionState())
    interaction.setKLinePositions([0, 10], { start: 0, end: 2 }, 10)

    interaction.onPointerMove({ clientX: 50, clientY: 40, isPrimary: true } as PointerEvent)
    interaction.onPointerLeave({ isPrimary: true } as PointerEvent)
    interaction.flushPendingHover()

    expect(interaction.crosshairPos).toBeNull()
    expect(interaction.crosshairIndex).toBeNull()
  })

  it('keeps an active pan through pointerleave caused by a layout change', () => {
    const scrollTo = vi.fn(() => true)
    const chart = createChartStub({ dpr: 1, plotWidth: 300, plotHeight: 160, scrollTo })
    const interaction = new InteractionController(chart as never, createMockInteractionState())

    interaction.onPointerDown({
      clientX: 100,
      clientY: 40,
      isPrimary: true,
      pointerId: 7,
    } as PointerEvent)
    interaction.onPointerLeave({ isPrimary: true, pointerId: 7 } as PointerEvent)
    interaction.onPointerMove({
      clientX: 80,
      clientY: 40,
      isPrimary: true,
      pointerId: 7,
    } as PointerEvent)

    expect(interaction.isDraggingState()).toBe(true)
    expect(scrollTo).toHaveBeenCalledWith(20)
  })

  it('ends an active pan when the browser cancels its pointer stream', () => {
    const chart = createChartStub({ dpr: 1, plotWidth: 300, plotHeight: 160 })
    const interaction = new InteractionController(chart as never, createMockInteractionState())

    interaction.onPointerDown({
      clientX: 100,
      clientY: 40,
      isPrimary: true,
      pointerId: 7,
    } as PointerEvent)
    interaction.onPointerCancel({ isPrimary: true, pointerId: 7 } as PointerEvent)

    expect(interaction.isDraggingState()).toBe(false)
  })

  it('indexes bars from sealed frameVisibleRange, not stale viewport.visibleFrom', () => {
    // hit-test 与 positions 必须同帧同源；即使 viewport 快照与 seal range 不一致，也以 seal 为准
    const chart = createChartStub({ dpr: 1, plotWidth: 300, plotHeight: 160 })
    chart.viewport.peek = () => ({
      zoomLevel: 1,
      plotWidth: 300,
      plotHeight: 160,
      dpr: 1,
      visibleFrom: 99,
      visibleTo: 101,
      kWidth: 6,
      kGap: 2,
    })
    const interaction = new InteractionController(chart as never, createMockInteractionState())
    interaction.setKLinePositions([0, 10], { start: 0, end: 2 }, 10)

    interaction.onPointerMove({ clientX: 5, clientY: 40, isPrimary: true } as PointerEvent)
    interaction.flushPendingHover()

    expect(interaction.crosshairIndex).toBe(0)
    expect(interaction.crosshairPos).not.toBeNull()
  })
})

describe('InteractionController pane capability gating', () => {
  it('does not set hoveredIndex when pointer is in indicator pane', () => {
    const chart = createChartStub({
      dpr: 1,
      plotWidth: 300,
      plotHeight: 200,
      paneByY: [
        { id: 'main', top: 0, height: 100, candleHitTest: true },
        { id: 'sub_MACD', top: 100, height: 100, candleHitTest: false },
      ],
    })
    const interaction = new InteractionController(chart as never, createMockInteractionState())

    interaction.setKLinePositions([0, 10], { start: 0, end: 2 }, 10)
    interaction.onPointerMove({ clientX: 5, clientY: 140, isPrimary: true } as PointerEvent)
    interaction.flushPendingHover()

    expect(interaction.activePaneId).toBe('sub_MACD')
    expect(interaction.hoveredIndex).toBeNull()
  })

  it('sets hoveredIndex when candle is hit in price pane', () => {
    const chart = createChartStub({
      dpr: 1,
      plotWidth: 300,
      plotHeight: 200,
      paneByY: [
        { id: 'main', top: 0, height: 100, candleHitTest: true },
        { id: 'sub_MACD', top: 100, height: 100, candleHitTest: false },
      ],
    })
    const interaction = new InteractionController(chart as never, createMockInteractionState())

    interaction.setKLinePositions([0, 10], { start: 0, end: 2 }, 10)
    interaction.onPointerMove({ clientX: 5, clientY: 10, isPrimary: true } as PointerEvent)
    interaction.flushPendingHover()

    expect(interaction.activePaneId).toBe('main')
    expect(interaction.crosshairIndex).not.toBeNull()
    expect(interaction.hoveredIndex).toBe(interaction.crosshairIndex)
  })

  it('clears hoveredIndex when moving from price pane to indicator pane', () => {
    const chart = createChartStub({
      dpr: 1,
      plotWidth: 300,
      plotHeight: 200,
      paneByY: [
        { id: 'main', top: 0, height: 100, candleHitTest: true },
        { id: 'sub_MACD', top: 100, height: 100, candleHitTest: false },
      ],
    })
    const interaction = new InteractionController(chart as never, createMockInteractionState())

    interaction.setKLinePositions([0, 10], { start: 0, end: 2 }, 10)
    interaction.onPointerMove({ clientX: 5, clientY: 10, isPrimary: true } as PointerEvent)
    interaction.flushPendingHover()
    expect(interaction.hoveredIndex).toBe(interaction.crosshairIndex)

    interaction.onPointerMove({ clientX: 5, clientY: 140, isPrimary: true } as PointerEvent)
    interaction.flushPendingHover()
    expect(interaction.activePaneId).toBe('sub_MACD')
    expect(interaction.hoveredIndex).toBeNull()
  })
})

describe('InteractionController hover snapshot', () => {
  it('clears marker hover payloads on scroll', () => {
    const setHover = vi.fn()
    const marker = { id: 'm1' }
    const chart = createChartStub({
      dpr: 1,
      plotWidth: 300,
      plotHeight: 200,
      markerManager: {
        hitTest: () => marker,
        setHover,
        hitTestCustomMarker: () => null,
      },
    })
    const interaction = new InteractionController(chart as never, createMockInteractionState())

    interaction.onPointerMove({ clientX: 20, clientY: 20, isPrimary: true } as PointerEvent)
    interaction.flushPendingHover()
    expect(interaction.getInteractionSnapshot().hoveredMarkerData).toBe(marker)

    interaction.onScroll()

    const snapshot = interaction.getInteractionSnapshot()
    expect(snapshot.hoveredMarkerData).toBeNull()
    expect(snapshot.hoveredCustomMarker).toBeNull()
    expect(snapshot.crosshairPos).toBeNull()
    expect(snapshot.hoveredIndex).toBeNull()
    expect(setHover).toHaveBeenCalledWith(null)
  })

  it('emits cleared snapshot when moving away from custom marker', () => {
    const customMarker = { id: 'c1' }
    let hoveringCustom = true
    const chart = createChartStub({
      dpr: 1,
      plotWidth: 300,
      plotHeight: 200,
      markerManager: {
        hitTest: () => null,
        setHover: () => undefined,
        hitTestCustomMarker: () => (hoveringCustom ? customMarker : null),
      },
    })
    const interaction = new InteractionController(chart as never, createMockInteractionState())

    interaction.onPointerMove({ clientX: 20, clientY: 20, isPrimary: true } as PointerEvent)
    interaction.flushPendingHover()
    expect(interaction.getInteractionSnapshot().hoveredCustomMarker).toBe(customMarker)

    hoveringCustom = false
    interaction.setKLinePositions([0, 10], { start: 0, end: 2 }, 10)
    interaction.onPointerMove({ clientX: 20, clientY: 20, isPrimary: true } as PointerEvent)
    interaction.flushPendingHover()

    expect(interaction.getInteractionSnapshot().hoveredCustomMarker).toBeNull()
  })

  it('maps drawing coordinates through sealed frame centers', () => {
    const chart = createChartStub({ dpr: 1, plotWidth: 300, plotHeight: 200 })
    const interaction = new InteractionController(chart as never, createMockInteractionState())

    interaction.setKLinePositions([0, 30, 130], { start: 20, end: 23 }, 10, [8, 37, 137])

    expect(interaction.getScreenXAtLogicalIndex(22)).toBe(137)
    expect(interaction.getScreenXAtLogicalIndex(23)).toBe(237)
    expect(interaction.getLogicalIndexAtScreenX(138)).toBe(23)
    expect(interaction.getLogicalIndexAtScreenX(121)).toBe(22)
    expect(interaction.getLogicalIndexAtScreenX(20)).toBe(20)
  })
})
