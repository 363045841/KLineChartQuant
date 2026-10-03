// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import { InteractionController } from '@/core/controller/interaction'
import { ChartDataViewId } from '@/foundation/types/chartView'

import {
  createChartStub,
  createInteractionBars,
  createInteractionTimeShare,
  createMockInteractionState,
} from './helpers/interactionTestKit'

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
    const chart = createChartStub({
      dpr: 1,
      plotWidth: 300,
      plotHeight: 160,
      scrollTo: () => true,
      data: createInteractionBars(20),
    })
    const interaction = new InteractionController(chart as never, createMockInteractionState())
    interaction.setViewSnapshot(chart.kernel.viewport.readonly.viewSnapshot.peek())

    interaction.onPointerMove({ clientX: 44, clientY: 40, isPrimary: true } as PointerEvent)
    interaction.flushPendingHover()
    expect(interaction.crosshairPos).not.toBeNull()

    interaction.onPointerDown({
      clientX: 44,
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
    // 平移已更新模型滚动量，渲染帧封存新投影后用松手位置恢复 hover。
    interaction.setViewSnapshot(chart.kernel.viewport.readonly.viewSnapshot.peek())
    interaction.flushPendingHover()
    expect(interaction.crosshairPos).not.toBeNull()
    expect(interaction.hoveredIndex).not.toBeNull()
  })

  it('keeps the crosshair value index while panning so legend values do not drift', () => {
    const chart = createChartStub({ dpr: 1, plotWidth: 300, plotHeight: 160, scrollTo: () => true })
    const interaction = new InteractionController(chart as never, createMockInteractionState())
    interaction.setViewSnapshot(chart.kernel.viewport.readonly.viewSnapshot.peek())

    interaction.onPointerMove({ clientX: 50, clientY: 40, isPrimary: true } as PointerEvent)
    interaction.flushPendingHover()
    const index = interaction.crosshairIndex
    expect(index).not.toBeNull()

    interaction.onPointerDown({
      clientX: 50,
      clientY: 40,
      isPrimary: true,
      pointerId: 1,
    } as PointerEvent)
    interaction.onPointerMove({ clientX: 30, clientY: 40, isPrimary: true } as PointerEvent)

    // 平移隐藏十字线，但取值索引必须保持不变，Legend 数值才不会随视口变化。
    expect(interaction.crosshairPos).toBeNull()
    expect(interaction.crosshairIndex).toBe(index)

    interaction.onPointerUp({
      clientX: 30,
      clientY: 40,
      isPrimary: true,
      pointerId: 1,
    } as PointerEvent)
  })

  it('uses viewport plot bounds for hit boundary checks', () => {
    const chart = createChartStub({ dpr: 2, plotWidth: 100, plotHeight: 80 })
    const interaction = new InteractionController(chart as never, createMockInteractionState())

    interaction.setViewSnapshot(chart.kernel.viewport.readonly.viewSnapshot.peek())

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
    interactionDpr1.setViewSnapshot(chartDpr1.kernel.viewport.readonly.viewSnapshot.peek())

    interactionDpr1.onPointerMove({ clientX: 8, clientY: 40, isPrimary: true } as PointerEvent)
    interactionDpr1.flushPendingHover()
    expect(interactionDpr1.crosshairIndex).toBe(0)

    const chartDpr2 = createChartStub({ dpr: 2, plotWidth: 300, plotHeight: 160 })
    const interactionDpr2 = new InteractionController(
      chartDpr2 as never,
      createMockInteractionState(),
    )
    interactionDpr2.setViewSnapshot(chartDpr2.kernel.viewport.readonly.viewSnapshot.peek())

    interactionDpr2.onPointerMove({ clientX: 8, clientY: 40, isPrimary: true } as PointerEvent)
    interactionDpr2.flushPendingHover()
    expect(interactionDpr2.crosshairIndex).toBe(1)
  })

  it('uses timeshare centers to select and snap the crosshair', () => {
    const chart = createChartStub({
      dpr: 1,
      plotWidth: 300,
      plotHeight: 160,
      dataView: ChartDataViewId.TimeShare,
      data: createInteractionTimeShare(10),
    })
    const interaction = new InteractionController(chart as never, createMockInteractionState())

    // 分钟槽位中心为 30..39，与 K 线物理宽度不同，命中必须读交易中心而非 position + width/2。
    interaction.setViewSnapshot(chart.kernel.viewport.readonly.viewSnapshot.peek())
    interaction.onPointerMove({ clientX: 10, clientY: 40, isPrimary: true } as PointerEvent)
    interaction.flushPendingHover()

    expect(interaction.crosshairIndex).toBe(0)
    expect(interaction.crosshairPos?.x).toBe(30)
  })

  it('pointermove does not write crosshair until flushPendingHover', () => {
    const chart = createChartStub({ dpr: 1, plotWidth: 100, plotHeight: 80 })
    const interaction = new InteractionController(chart as never, createMockInteractionState())
    interaction.setViewSnapshot(chart.kernel.viewport.readonly.viewSnapshot.peek())

    interaction.onPointerMove({ clientX: 50, clientY: 40, isPrimary: true } as PointerEvent)
    expect(interaction.crosshairPos).toBeNull()

    interaction.flushPendingHover()
    expect(interaction.crosshairPos).not.toBeNull()
  })

  it('pointerleave cancels pending hover so flush does not restore crosshair', () => {
    const chart = createChartStub({ dpr: 1, plotWidth: 100, plotHeight: 80 })
    const interaction = new InteractionController(chart as never, createMockInteractionState())
    interaction.setViewSnapshot(chart.kernel.viewport.readonly.viewSnapshot.peek())

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

    interaction.setViewSnapshot(chart.kernel.viewport.readonly.viewSnapshot.peek())
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

    interaction.setViewSnapshot(chart.kernel.viewport.readonly.viewSnapshot.peek())
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

    interaction.setViewSnapshot(chart.kernel.viewport.readonly.viewSnapshot.peek())
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
    interaction.setViewSnapshot(chart.kernel.viewport.readonly.viewSnapshot.peek())
    interaction.onPointerMove({ clientX: 20, clientY: 20, isPrimary: true } as PointerEvent)
    interaction.flushPendingHover()

    expect(interaction.getInteractionSnapshot().hoveredCustomMarker).toBeNull()
  })

  it('maps drawing coordinates through the shared slot grid', () => {
    const chart = createChartStub({ dpr: 1, plotWidth: 300, plotHeight: 200 })
    const interaction = new InteractionController(chart as never, createMockInteractionState())

    interaction.setViewSnapshot(chart.kernel.viewport.readonly.viewSnapshot.peek())

    // K 线中心网格 origin=6、step=10；索引与屏幕坐标互为逆映射。
    expect(interaction.getScreenXAtLogicalIndex(22)).toBe(226)
    expect(interaction.getScreenXAtLogicalIndex(23)).toBe(236)
    expect(interaction.getLogicalIndexAtScreenX(226)).toBe(22)
    expect(interaction.getLogicalIndexAtScreenX(236)).toBe(23)
    expect(interaction.getLogicalIndexAtScreenX(6)).toBe(0)
  })
})
