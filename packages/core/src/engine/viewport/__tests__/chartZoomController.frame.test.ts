/**
 * ChartZoomController.frame 契约：缩放与滚动落在同一次导航提交。
 *
 * 数值基准：dpr=1、plotWidth=1000、dataLength=10。
 */
import { describe, expect, it } from 'vitest'
import { createOptionsState } from '../../state/optionsState'
import { createViewportState } from '../../state/viewportState'
import { ChartZoomController } from '../chartZoomController'
import { createViewportStateDeps } from './helpers/viewportFixture'

/** 装配真实 viewport 与 options，不触碰 DOM。 */
function makeController(period = 'daily', dataLength = 10) {
  const deps = createViewportStateDeps({ dataLength, period, initialZoomLevel: 3, zoomLevelCount: 6 })
  const viewport = createViewportState(deps)
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

  const controller = new ChartZoomController({ viewport, options, onChange: () => {} })
  return { viewport, controller }
}

describe('ChartZoomController.frame', () => {
  it('commits the zoom level and the anchored scroll together', () => {
    const { controller, viewport } = makeController()

    controller.frame({ level: 4.5, anchorSlot: 7.5 })

    const navigation = viewport.readonly.navigation()
    expect(navigation.zoomLevel).toBeCloseTo(4.5, 8)
    expect(navigation.scroll).toBeCloseTo(viewport.readonly.viewSnapshot().scroll, 8)
    expect(viewport.readonly.viewportState().zoomLevel).toBeCloseTo(4.5, 8)
  })

  it('clamps the target level to the configured range', () => {
    const { controller, viewport } = makeController()

    controller.frame({ level: 99, anchorSlot: 0 })

    expect(viewport.readonly.navigation().zoomLevel).toBe(6)
  })

  it('ignores non-finite targets without writing navigation', () => {
    const { controller, viewport } = makeController()
    const before = viewport.readonly.navigation()

    controller.frame({ level: Number.NaN, anchorSlot: 0 })
    controller.frame({ level: 2, anchorSlot: Number.NaN })

    expect(viewport.readonly.navigation()).toBe(before)
  })
})
