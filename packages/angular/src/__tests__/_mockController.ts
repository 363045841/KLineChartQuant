/**
 * Angular 适配层 contract 测试用的窄 ChartController 替身。
 *
 * 只声明 `KLineChartComponent` 与 contract 测试实际消费的成员，不复制完整
 * `ChartController` 接口。以 `Partial<ChartController>` 约束各成员签名，接口新增
 * 成员不会再强制改动本文件；仅在运行时读取的字段缺失时才会暴露问题。
 */

import { createSignal } from '@363045841yyt/klinechart-core/reactivity'

import type {
  ChartController,
  ChartViewport,
  IndicatorInstance,
  InteractionSnapshot,
} from '@363045841yyt/klinechart-core'

export interface MockControllerHandle {
  controller: ChartController
  /** 测试辅助：统计 dispose() 调用次数 */
  getDisposeCount: () => number
}

/** 创建组件生命周期测试所需的最小 controller 替身。 */
export function createMockChartController(): MockControllerHandle {
  const viewport = createSignal<ChartViewport>({
    zoomLevel: 1,
    kWidth: 2,
    kGap: 1,
    plotWidth: 800,
    plotHeight: 600,
    dpr: 1,
    visibleFrom: 0,
    visibleTo: 0,
  })
  const interactionState = createSignal<InteractionSnapshot>({
    crosshairPos: null,
    crosshairIndex: null,
    crosshairPrice: null,
    hoveredIndex: null,
    activePaneId: null,
    tooltipPos: { x: 0, y: 0 },
    tooltipAnchorPlacement: 'right-bottom',
    hoveredMarkerData: null,
    hoveredCustomMarker: null,
    isDragging: false,
    isResizingPaneBoundary: false,
    isHoveringPaneBoundary: false,
    hoveredPaneBoundaryId: null,
    isHoveringRightAxis: false,
  })
  const paneRatios = createSignal<Readonly<Record<string, number>>>({})
  const indicators = createSignal<ReadonlyArray<IndicatorInstance>>([])

  let disposeCount = 0

  const controller: Partial<ChartController> = {
    viewport,
    interactionState,
    paneRatios,
    indicators,
    setData() {
      /* no-op */
    },
    setSymbols() {
      /* no-op */
    },
    setTheme() {
      /* no-op */
    },
    setSystemTheme() {
      /* no-op */
    },
    updateSettingsFacade() {
      /* no-op */
    },
    handlePointerEvent() {
      return false
    },
    handleWheelEvent() {
      /* no-op */
    },
    handleScrollEvent() {
      /* no-op */
    },
    addIndicator() {
      return null
    },
    removeIndicator() {
      return false
    },
    /** zoomToLevel 是 contract 测试唯一驱动的行为：写回 viewport signal。 */
    zoomToLevel(level: number) {
      viewport.set({ ...viewport.peek(), zoomLevel: level })
    },
    zoomIn() {
      /* no-op */
    },
    zoomOut() {
      /* no-op */
    },
    dispose() {
      disposeCount += 1
    },
  }

  return {
    controller: controller as ChartController,
    getDisposeCount: () => disposeCount,
  }
}
