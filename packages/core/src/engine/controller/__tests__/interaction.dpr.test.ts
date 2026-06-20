// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { InteractionController } from '@/core/controller/interaction'
import type { KLineData } from '@/types/price'

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
    getViewport: () => ({
      viewWidth: 320,
      viewHeight: 200,
      plotWidth: args.plotWidth,
      plotHeight: args.plotHeight,
      scrollLeft: 0,
      dpr: args.dpr,
    }),
    getCurrentDpr: () => args.dpr,
    getCachedScrollLeft: () => 0,
    getLogicalScrollLeft: () => 0,
    getMarkerManager: () => markerManager,
    getPaneRenderers: () => paneRenderers,
    getData: () => data,
    getRenderData: () => data,
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
    const interaction = new InteractionController(chart as never)

    interaction.setKLinePositions([0, 10], { start: 0, end: 2 }, 10)

    interaction.onPointerMove({ clientX: 50, clientY: 40, isPrimary: true } as PointerEvent)
    expect(interaction.crosshairPos).not.toBeNull()

    interaction.onPointerMove({ clientX: 120, clientY: 40, isPrimary: true } as PointerEvent)
    expect(interaction.crosshairPos).toBeNull()
    expect(interaction.crosshairIndex).toBeNull()
  })

  it('uses current DPR in kWidthLogical = kWidthPx / dpr path', () => {
    const chartDpr1 = createChartStub({ dpr: 1, plotWidth: 300, plotHeight: 160 })
    const interactionDpr1 = new InteractionController(chartDpr1 as never)
    interactionDpr1.setKLinePositions([0, 10], { start: 0, end: 2 }, 10)

    interactionDpr1.onPointerMove({ clientX: 8, clientY: 40, isPrimary: true } as PointerEvent)
    expect(interactionDpr1.crosshairIndex).toBe(0)

    const chartDpr2 = createChartStub({ dpr: 2, plotWidth: 300, plotHeight: 160 })
    const interactionDpr2 = new InteractionController(chartDpr2 as never)
    interactionDpr2.setKLinePositions([0, 10], { start: 0, end: 2 }, 10)

    interactionDpr2.onPointerMove({ clientX: 8, clientY: 40, isPrimary: true } as PointerEvent)
    expect(interactionDpr2.crosshairIndex).toBe(1)
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
    const interaction = new InteractionController(chart as never)

    interaction.setKLinePositions([0, 10], { start: 0, end: 2 }, 10)
    interaction.onPointerMove({ clientX: 5, clientY: 140, isPrimary: true } as PointerEvent)

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
    const interaction = new InteractionController(chart as never)

    interaction.setKLinePositions([0, 10], { start: 0, end: 2 }, 10)
    interaction.onPointerMove({ clientX: 5, clientY: 10, isPrimary: true } as PointerEvent)

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
    const interaction = new InteractionController(chart as never)

    interaction.setKLinePositions([0, 10], { start: 0, end: 2 }, 10)
    interaction.onPointerMove({ clientX: 5, clientY: 10, isPrimary: true } as PointerEvent)
    expect(interaction.hoveredIndex).toBe(interaction.crosshairIndex)

    interaction.onPointerMove({ clientX: 5, clientY: 140, isPrimary: true } as PointerEvent)
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
    const interaction = new InteractionController(chart as never)

    interaction.onPointerMove({ clientX: 20, clientY: 20, isPrimary: true } as PointerEvent)
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
    const interaction = new InteractionController(chart as never)
    const changes: ReturnType<typeof interaction.getInteractionSnapshot>[] = []
    interaction.setOnInteractionChange((snapshot) => {
      changes.push(snapshot)
    })

    interaction.onPointerMove({ clientX: 20, clientY: 20, isPrimary: true } as PointerEvent)
    expect(interaction.getInteractionSnapshot().hoveredCustomMarker).toBe(customMarker)

    hoveringCustom = false
    interaction.setKLinePositions([0, 10], { start: 0, end: 2 }, 10)
    interaction.onPointerMove({ clientX: 20, clientY: 20, isPrimary: true } as PointerEvent)

    expect(interaction.getInteractionSnapshot().hoveredCustomMarker).toBeNull()
    expect(changes[changes.length - 1]?.hoveredCustomMarker).toBeNull()
  })
})
