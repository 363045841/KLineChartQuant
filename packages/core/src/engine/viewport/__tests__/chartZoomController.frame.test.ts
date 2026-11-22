/**
 * ChartZoomController.frame 契约：程序定位与交互缩放共用一个提交点。
 *
 * 数值基准：dpr=1，plotWidth=1000，dataLength=10，宽高随用例声明。
 */
import { describe, expect, it } from 'vitest'
import { KLINE_GAP_RATIOS } from '@/foundation/config/chartSettings'
import { computed, createSignal } from '@/foundation/reactivity/signal'
import { createOptionsState } from '../../state/optionsState'
import { createViewportState } from '../../state/viewportState'
import { createZoomState } from '../../state/zoomState'
import { ChartZoomController } from '../chartZoomController'
import { createViewportStateDeps } from './helpers/viewportFixture'

/** 组装真实 viewport / zoom / options 状态与控制器（无 DOM 依赖）。 */
function makeController(period = 'daily', dataLength = 10) {
  const deps = createViewportStateDeps({ dataLength, period })
  const zoomState = createZoomState({
    minKWidth$: createSignal(3),
    maxKWidth$: createSignal(21),
    dataView$: deps.dataView$,
    zoomLevelCount: 6,
  })
  zoomState.actions.setZoomLevel(3)

  const viewport = createViewportState({
    ...deps,
    geometry$: computed(() => ({
      bottomAxisHeight: 24,
      kWidth: zoomState.readonly.kWidth(),
      kGapRatio: KLINE_GAP_RATIOS.standard,
    })),
    zoomLevel$: zoomState.readonly.zoomLevel,
    timeShareSlotWidth$: zoomState.readonly.timeShareSlotWidth,
  })
  viewport.actions.resize(1000, 500, 1)

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
    initialZoomLevel: 3,
  })

  const controller = new ChartZoomController({ viewport, options, onChange: () => {} }, zoomState)
  return { viewport, controller, zoomState }
}

describe('ChartZoomController.frame', () => {
  it('commits a continuous zoom level together with the anchored scroll', () => {
    const { controller, viewport } = makeController()

    controller.frame({ level: 4.5, anchorSlot: 7.5 })

    expect(viewport.readonly.viewportState.peek().zoomLevel).toBeCloseTo(4.5, 8)
    const view = viewport.readonly.viewSnapshot.peek()
    expect(view.grid.origin + 7.5 * view.grid.step - view.scroll).toBeCloseTo(0, 6)
  })

  it('still moves the scroll when the zoom level does not change', () => {
    const { controller, viewport } = makeController()
    const level = viewport.readonly.viewportState.peek().zoomLevel
    const before = viewport.readonly.viewSnapshot.peek().scroll

    controller.frame({ level, anchorSlot: 9 })

    expect(viewport.readonly.viewSnapshot.peek().scroll).not.toBe(before)
  })

  it.each([
    [1_000, 6],
    [-5, 1],
  ])('clamps the level %s into the configured zoom range', (level, expected) => {
    const { controller, viewport } = makeController()

    controller.frame({ level, anchorSlot: 0 })

    expect(viewport.readonly.viewportState.peek().zoomLevel).toBe(expected)
  })

  it('ignores non-finite targets', () => {
    const { controller, viewport } = makeController()
    const before = viewport.readonly.viewportState.peek()

    controller.frame({ level: Number.NaN, anchorSlot: 0 })
    controller.frame({ level: 3, anchorSlot: Number.POSITIVE_INFINITY })

    expect(viewport.readonly.viewportState.peek()).toBe(before)
  })

  it('leaves fixed views untouched', () => {
    const { controller, viewport } = makeController('timeshare')
    const before = viewport.readonly.viewSnapshot.peek()

    controller.frame({ level: 6, anchorSlot: 3 })

    expect(viewport.readonly.viewSnapshot.peek().scroll).toBe(before.scroll)
  })
})
