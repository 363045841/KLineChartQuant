/**
 * ChartZoomController 未来区（future time axis）回归测试。
 *
 * 覆盖：拖入未来区后缩放，锚点为指针所在槽位（无指针手势取视口左缘）；
 * 滚动量由 viewportState 的 maxScrollLeft 统一夹取（显式 3 屏未来区），不被拉回数据右缘。
 *
 * 数值基准：dpr=1，viewWidth=plotWidth=1000，dataLength=10，
 * 级别 6→5 缩小一级（kWidth 21→17.4，kGapPx 均钳 3，旧 unitPx=24 / 新 unitPx=20）。
 */
import { describe, expect, it } from 'vitest'
import type { ChartDataView } from '@/engine/state/modeState'
import { createSignal } from '@/foundation/reactivity/signal'
import { createViewportStateDeps } from '../../state/__tests__/helpers/createViewportStateDeps'
import { createOptionsState } from '../../state/optionsState'
import { createViewportState } from '../../state/viewportState'
import { createZoomState } from '../../state/zoomState'
import { ChartZoomController } from '../chartZoomController'

/** 组装真实 viewportState / zoomState / optionsState 与控制器（无 DOM 依赖）。 */
function makeController() {
  const deps = createViewportStateDeps({ dataLength: 10, futureScreens: 3 })
  const viewport = createViewportState({
    options$: deps.options$,
    dataLength$: deps.dataLength$,
    period$: deps.period$,
    zoomLevel$: deps.zoomLevel$,
  })
  viewport.actions.resize(1000, 500, 1)

  const zoomState = createZoomState({
    minKWidth$: createSignal(3),
    maxKWidth$: createSignal(21),
    dataView$: createSignal<ChartDataView>('kline'),
    zoomLevelCount: 6,
  })
  zoomState.actions.setZoomLevel(6)

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
      period$: deps.period$,
      getPlotWidth: () => 1000,
      onChange: () => {},
    },
    zoomState,
  )
  return { viewport, controller }
}

describe('ChartZoomController future region', () => {
  it('拖入未来区后 zoomOut：以指针槽位为锚点，不被拉回数据右缘', () => {
    const { viewport, controller } = makeController()

    // 拖到最右：viewport 滚动上限含未来区（3 屏），scrollLeftLogical 落在未来区深处
    viewport.actions.scrollTo(viewport.readonly.maxScrollLeft.peek())
    expect(viewport.readonly.scrollLeftLogical.peek()).toBe(2103)

    controller.zoomOut()

    // 无指针手势取视口左缘槽位（旧 2103 → 新 1753）；viewport 上限 3103 不截断 1753+1000。
    expect(viewport.readonly.scrollLeft.peek()).toBe(2753)
  })
})
