/** 验证公开命中查询 hitTestAt：坐标换算、候选过滤与空结果语义。 */
import { describe, expect, it } from 'vitest'

import {
  createDrawingObject,
  createSelectionAdapter,
  stubDrawingControllerInternals,
} from '../../__tests__/helpers/drawingTestKit'
import { DrawingInteractionController } from '../impl/interaction'

/** hitTestAt 用例的 pane 布局：main pane top=40，模拟上方有时间轴等占位。 */
const HIT_TEST_PANE = { paneTop: 40, paneHeight: 160, plotHeight: 200 }

describe('DrawingInteractionController hitTestAt', () => {
  it('把容器局部 Y 换算为 Pane 局部 Y 后查询，命中返回图元', () => {
    const free = createDrawingObject({ id: 'free' })
    const locked = createDrawingObject({ id: 'locked', locked: true })
    const { adapter } = createSelectionAdapter([free, locked], HIT_TEST_PANE)
    const controller = new DrawingInteractionController(adapter)
    const internal = stubDrawingControllerInternals(controller, {
      hit: { drawing: free, target: { type: 'all' } },
    })

    expect(controller.hitTestAt(20, 55)).toBe(free)
    // y=55 减 pane.top=40 后以 Pane 局部 15 查询；锁定图元同样进入候选。
    expect(internal.hitTester.hitTest).toHaveBeenCalledWith(20, 15, [free, locked], adapter)
  })

  it('未命中或 Pane 不可解析时返回 null', () => {
    const drawing = createDrawingObject({ id: 'only' })
    const { adapter } = createSelectionAdapter([drawing], HIT_TEST_PANE)
    const controller = new DrawingInteractionController(adapter)
    stubDrawingControllerInternals(controller, { hit: null })
    expect(controller.hitTestAt(20, 55)).toBeNull()

    const noPaneAdapter = {
      ...adapter,
      getPaneAtY: () => undefined,
    }
    const noPaneController = new DrawingInteractionController(noPaneAdapter)
    expect(noPaneController.hitTestAt(20, 55)).toBeNull()
  })
})
