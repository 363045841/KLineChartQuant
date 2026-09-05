// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import { InteractionController } from '@/core/controller/interaction'
import type { KLineData } from '@/types/price'
import { writableRef } from '../../../foundation/reactivity/signal'
import { ChartDataViewId, type ChartDataView } from '../../../foundation/types/chartView'

function createMockInteractionState() {
  const signals = {
    crosshairPos: writableRef<{ x: number; y: number } | null>(null),
    crosshairPrice: writableRef<number | null>(null),
    crosshairIndex: writableRef<number | null>(null),
    hoveredIndex: writableRef<number | null>(null),
    activePaneId: writableRef<string | null>(null),
    isDragging: writableRef(false),
    dragMode: writableRef<'none' | 'pan' | 'resize-separator' | 'scale-price' | 'explore'>('none'),
    hoveredSeparatorUpperPaneId: writableRef<string | null>(null),
    hoveredRightAxisPaneId: writableRef<string | null>(null),
    tooltipPos: writableRef<{ x: number; y: number }>({ x: 0, y: 0 }),
    tooltipAnchorPlacement: writableRef<'right-bottom' | 'left-bottom'>('right-bottom'),
    hoveredMarkerData: writableRef<any>(null),
    hoveredCustomMarker: writableRef<any>(null),
    hoveredMarkerId: writableRef<string | null>(null),
    rangeSelection: writableRef({
      startTimestamp: null as number | null,
      endTimestamp: null as number | null,
      isDragging: false,
    }),
    selectedRange: writableRef<{ from: number; to: number } | null>(null),
  }

  return {
    readonly: {
      crosshairPos: signals.crosshairPos,
      crosshairPrice: signals.crosshairPrice,
      crosshairIndex: signals.crosshairIndex,
      hoveredIndex: signals.hoveredIndex,
      activePaneId: signals.activePaneId,
      isDragging: signals.isDragging,
      dragMode: signals.dragMode,
      hoveredSeparatorUpperPaneId: signals.hoveredSeparatorUpperPaneId,
      hoveredRightAxisPaneId: signals.hoveredRightAxisPaneId,
      tooltipPos: signals.tooltipPos,
      tooltipAnchorPlacement: signals.tooltipAnchorPlacement,
      hoveredMarkerData: signals.hoveredMarkerData,
      hoveredCustomMarker: signals.hoveredCustomMarker,
      hoveredMarkerId: signals.hoveredMarkerId,
      rangeSelection: signals.rangeSelection,
      selectedRange: signals.selectedRange,
      interactionSnapshot: {
        peek: () => ({
          crosshairPos: signals.crosshairPos.peek(),
          crosshairIndex: signals.crosshairIndex.peek(),
          crosshairPrice: signals.crosshairPrice.peek(),
          hoveredIndex: signals.hoveredIndex.peek(),
          activePaneId: signals.activePaneId.peek(),
          tooltipPos: signals.tooltipPos.peek(),
          tooltipAnchorPlacement: signals.tooltipAnchorPlacement.peek(),
          hoveredMarkerData: signals.hoveredMarkerData.peek(),
          hoveredCustomMarker: signals.hoveredCustomMarker.peek(),
          isDragging: signals.isDragging.peek(),
          isResizingPaneBoundary: signals.dragMode.peek() === 'resize-separator',
          isHoveringPaneBoundary: signals.hoveredSeparatorUpperPaneId.peek() !== null,
          hoveredPaneBoundaryId: signals.hoveredSeparatorUpperPaneId.peek(),
          isHoveringRightAxis: signals.hoveredRightAxisPaneId.peek() !== null,
        }),
      } as any,
    },
    actions: {
      updateCrosshair(pos: any, price: any, index?: any) {
        signals.crosshairPos.set(pos)
        signals.crosshairPrice.set(price)
        if (index !== undefined) signals.crosshairIndex.set(index)
      },
      setCrosshairIndex(index: any) {
        signals.crosshairIndex.set(index)
      },
      setHoveredIndex(index: any) {
        signals.hoveredIndex.set(index)
      },
      setActivePaneId(paneId: any) {
        signals.activePaneId.set(paneId)
      },
      updateHover(index: any, paneId: any) {
        signals.hoveredIndex.set(index)
        signals.activePaneId.set(paneId)
      },
      startDrag(mode: any) {
        signals.isDragging.set(true)
        signals.dragMode.set(mode)
      },
      endDrag() {
        signals.isDragging.set(false)
        signals.dragMode.set('none')
      },
      setDragMode(mode: any) {
        signals.dragMode.set(mode)
      },
      setSeparatorHover(id: any) {
        signals.hoveredSeparatorUpperPaneId.set(id)
      },
      setRightAxisHover(id: any) {
        signals.hoveredRightAxisPaneId.set(id)
      },
      updateTooltip(pos: any, placement: any) {
        signals.tooltipPos.set(pos)
        signals.tooltipAnchorPlacement.set(placement)
      },
      updateMarkerHover(id: any, md: any, cmd: any) {
        signals.hoveredMarkerId.set(id)
        signals.hoveredMarkerData.set(md)
        signals.hoveredCustomMarker.set(cmd)
      },
      startRangeSelection(timestamp: number) {
        signals.rangeSelection.set({
          startTimestamp: timestamp,
          endTimestamp: timestamp,
          isDragging: true,
        })
      },
      updateRangeSelection(timestamp: number) {
        signals.rangeSelection.set({ ...signals.rangeSelection.peek(), endTimestamp: timestamp })
      },
      finishRangeSelection(timestamp?: number) {
        signals.rangeSelection.set({
          ...signals.rangeSelection.peek(),
          endTimestamp: timestamp ?? signals.rangeSelection.peek().endTimestamp,
          isDragging: false,
        })
      },
      setRangeSelection(startTimestamp: number, endTimestamp: number) {
        signals.rangeSelection.set({ startTimestamp, endTimestamp, isDragging: false })
      },
      clearRangeSelection() {
        signals.rangeSelection.set({ startTimestamp: null, endTimestamp: null, isDragging: false })
      },
      reset() {
        signals.crosshairPos.set(null)
        signals.crosshairPrice.set(null)
        signals.crosshairIndex.set(null)
        signals.hoveredIndex.set(null)
        signals.activePaneId.set(null)
        signals.isDragging.set(false)
        signals.dragMode.set('none')
        signals.hoveredSeparatorUpperPaneId.set(null)
        signals.hoveredRightAxisPaneId.set(null)
        signals.tooltipPos.set({ x: 0, y: 0 })
        signals.tooltipAnchorPlacement.set('right-bottom')
        signals.hoveredMarkerData.set(null)
        signals.hoveredCustomMarker.set(null)
        signals.hoveredMarkerId.set(null)
      },
    },
    dispose() {},
  }
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
}) {
  const container = document.createElement('div') as HTMLDivElement
  Object.defineProperty(container, 'scrollLeft', { configurable: true, writable: true, value: 0 })
  Object.defineProperty(container, 'clientWidth', { configurable: true, value: 320 })
  Object.defineProperty(container, 'clientHeight', { configurable: true, value: 200 })
  Object.defineProperty(container, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 0, top: 0, width: 320, height: 200 }),
  })

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
    } as any,
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
        },
        actions: {
          scrollTo: () => undefined,
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
        },
      },
    },
    getMarkerManager: () => markerManager,
    getPaneRenderers: () => paneRenderers,
    getData: () => data,
    getRenderData: () => data,
    getInternalData: () => data,
    currentPeriod: 'daily',
    translatePrice: () => undefined,
    scheduleDraw: () => undefined,
    zoomAt: () => undefined,
    resetPriceOffset: () => undefined,
    resetPriceTransform: () => undefined,
    resizePaneBoundary: () => false,
    scalePrice: () => undefined,
  }

  return chart
}

describe('InteractionController DPR consumption', () => {
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
