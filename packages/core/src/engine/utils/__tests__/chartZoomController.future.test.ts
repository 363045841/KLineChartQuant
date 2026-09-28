/**
 * ChartZoomController 未来区（future time axis）回归测试。
 *
 * 覆盖：默认配置（用户未传 futureScreens）下，viewportState 已解析 3 屏未来区；
 * zoom 必须消费该已解析值（默认值解析单点），否则拖入未来区后缩放会被
 * 30 槽旧上限拉回数据右缘。
 *
 * 数值基准：dpr=1，viewWidth=plotWidth=clientWidth=1000，dataLength=10，
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
  const deps = createViewportStateDeps({ dataLength: 10 })
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
      getClientWidth: () => 1000,
      getDataLength: () => 10,
      getPlotWidth: () => 1000,
      onChange: () => {},
    },
    zoomState,
  )
  return { viewport, controller }
}

describe('ChartZoomController future region', () => {
  it('默认配置拖入未来区后 zoomOut：scrollTo 不被 30 槽旧上限拉回数据右缘', () => {
    const { viewport, controller } = makeController()

    // 拖到最右：viewport 滚动上限含未来区（默认 3 屏），scrollLeftLogical 落在未来区深处
    viewport.actions.scrollTo(viewport.readonly.maxScrollLeft.peek())
    expect(viewport.readonly.scrollLeftLogical.peek()).toBe(2103)

    controller.zoomOut()

    // zoom 侧 maxScroll 若按 30 槽裁剪会给出 1000（回归时的错误值）；
    // 含未来区（150 槽）后 maxScroll=3203，锚点换算 newScrollLeft=1753 →
    // newDomScrollLeft=1753+1000=2753，viewport 夹取（上限 3103）不再二次截断
    expect(viewport.readonly.scrollLeft.peek()).toBe(2753)
  })
})
