/**
 * ChartZoomController 未来区（future time axis）回归测试。
 *
 * 覆盖：拖入未来区后缩放，锚点为指针所在槽位（无指针手势取视口左缘）；
 * 滚动量由 viewportState 的 maxScrollLeft 统一夹取，始终保留两个已有数据槽位。
 *
 * 数值基准：dpr=1，viewWidth=plotWidth=1000，dataLength=10，
 * 级别 6→5 缩小一级（kWidth 21→17.4，kGapPx 均钳 3，旧 unitPx=24 / 新 unitPx=20）。
 */
import { describe, expect, it } from 'vitest'
import type { ChartDataView } from '@/engine/state/modeState'
import { computed, createSignal } from '@/foundation/reactivity/signal'
import { createViewportStateDeps } from '../../state/__tests__/helpers/createViewportStateDeps'
import { createOptionsState } from '../../state/optionsState'
import { createViewportState } from '../../state/viewportState'
import { createZoomState } from '../../state/zoomState'
import { ChartZoomController } from '../chartZoomController'

/** 组装真实 viewportState / zoomState / optionsState 与控制器（无 DOM 依赖）。 */
function makeController(dpr = 1, period = 'daily') {
  const deps = createViewportStateDeps({ dataLength: 10, period })
  const zoomState = createZoomState({
    minKWidth$: createSignal(3),
    maxKWidth$: createSignal(21),
    dataView$: deps.dataView$,
    zoomLevelCount: 6,
  })
  zoomState.actions.setZoomLevel(6)

  // 与真实 kernel 相同：viewport 直接订阅 zoomState 的 K 线宽度。
  const viewport = createViewportState({
    ...deps,
    options$: computed(() => ({
      bottomAxisHeight: 24,
      kWidth: zoomState.readonly.kWidth(),
    })),
    zoomLevel$: zoomState.readonly.zoomLevel,
    timeShareSlotWidth$: zoomState.readonly.timeShareSlotWidth,
  })
  viewport.actions.resize(1000, 500, dpr)

  const options = createOptionsState({
    yPaddingPx: 20,
    rightAxisWidth: 0,
    leftAxisWidth: 0,
    bottomAxisHeight: 24,
    minKWidth: 3,
    maxKWidth: 21,
    priceLabelWidth: 60,
    panes: [],
    zoomLevelCount: 6,
    initialZoomLevel: 6,
  })

  const controller = new ChartZoomController(
    {
      viewport,
      options,
      onChange: () => {},
    },
    zoomState,
  )
  return { viewport, controller }
}

describe('ChartZoomController 无界槽位', () => {
  it.each([-10000, -1000, -100, 0, 192, 10000])(
    '世界滚动量=%s：两侧扩展后连续缩放保持鼠标槽位',
    (scroll) => {
      const { viewport, controller } = makeController()
      viewport.actions.scrollToLogical(scroll)
      const pointer = 501.37
      const grid = viewport.readonly.slotGrid.peek()
      const coordinate = (scroll + pointer - grid.origin) / grid.step
      for (const level of [5, 4, 3, 2, 1, 2, 3, 4, 5, 6]) {
        controller.zoomToLevel(level, pointer)
        const next = viewport.readonly.slotGrid.peek()
        const actual = viewport.readonly.scrollLeftLogical.peek()
        expect((actual + pointer - next.origin) / next.step).toBeCloseTo(coordinate, 10)
        expect(viewport.readonly.viewport.peek().scrollLeft).toBe(actual)
        expect(viewport.readonly.scrollLeft.peek()).toBeGreaterThanOrEqual(0)
        expect(viewport.readonly.scrollLeft.peek()).toBeLessThanOrEqual(
          viewport.readonly.maxScrollLeft.peek(),
        )
      }
      expect(viewport.readonly.scrollLeftLogical.peek()).toBeCloseTo(scroll, 10)
    },
  )

  it('零滚轮增量与缩放极限不移动视口', () => {
    const { viewport, controller } = makeController()
    const scroll = viewport.readonly.scrollLeftLogical.peek()
    controller.handleWheel(0, 100)
    controller.zoomIn(100)
    expect(viewport.readonly.scrollLeftLogical.peek()).toBe(scroll)
  })

  it.each([1, 1.25, 1.5, 2])('DPR=%s：分时也按实际绘制网格保持指针槽位', (dpr) => {
    const { viewport, controller } = makeController(dpr, 'timeshare')
    viewport.actions.scrollToLogical(-3000)
    const pointer = 237.31
    const initialGrid = viewport.readonly.slotGrid.peek()
    const coordinate =
      (viewport.readonly.scrollLeftLogical.peek() + pointer - initialGrid.origin) / initialGrid.step
    for (const level of [5, 4, 3, 2, 1, 2, 3, 4, 5, 6]) {
      controller.zoomToLevel(level, pointer)
      const grid = viewport.readonly.slotGrid.peek()
      expect(
        (viewport.readonly.scrollLeftLogical.peek() + pointer - grid.origin) / grid.step,
      ).toBeCloseTo(coordinate, 10)
    }
  })
})
