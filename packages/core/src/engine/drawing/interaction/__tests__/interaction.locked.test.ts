/** 验证 locked 图元的交互语义：可点选、可框选，但不参与拖动。 */
import { describe, expect, it, vi } from 'vitest'

import {
  CONTAINER,
  createDrawingObject,
  createSelectionAdapter,
  pointerDown,
  pointerMove,
  stubDrawingControllerInternals,
} from '../../__tests__/helpers/drawingTestKit'
import { DrawingInteractionController } from '../impl/interaction'

describe('DrawingInteractionController locked drawings', () => {
  it('locked 图元可被点选，但不开始拖拽', () => {
    const locked = createDrawingObject({ id: 'locked', locked: true })
    const { adapter, setSelectedDrawingIds } = createSelectionAdapter([locked])
    const controller = new DrawingInteractionController(adapter)
    const internal = stubDrawingControllerInternals(controller, {
      hit: { drawing: locked, target: { type: 'all' } },
    })

    expect(controller.onPointerDown(pointerDown(10, 10), CONTAINER)).toBe(true)
    // 锁定图元进入命中候选，选中后不开拖；未选中时手柄不参与命中，因此选中集合为空。
    expect(internal.hitTester.hitTest).toHaveBeenCalledWith(10, 10, [locked], adapter, new Set())
    expect(setSelectedDrawingIds).toHaveBeenLastCalledWith(['locked'])
    expect(internal.dragHandler.startDrag).not.toHaveBeenCalled()
  })

  it('locked 图元可被框选选中', () => {
    const locked = createDrawingObject({ id: 'locked', locked: true })
    const free = createDrawingObject({ id: 'free' })
    const { adapter, setSelectedDrawingIds } = createSelectionAdapter([locked, free], {
      tool: 'box-select',
    })
    const controller = new DrawingInteractionController(adapter)
    const internal = stubDrawingControllerInternals(controller, { hit: null })
    internal.hitTester.getDrawingLineSegments = vi.fn(() => [
      { a: { x: 12, y: 12 }, b: { x: 28, y: 28 } },
    ])

    expect(controller.onPointerDown(pointerDown(10, 10), CONTAINER)).toBe(true)
    expect(controller.onPointerMove(pointerMove(30, 30), CONTAINER)).toBe(true)
    expect(controller.onPointerUp(pointerMove(30, 30), CONTAINER)).toBe(true)
    // 框选几何对两个图元都求交，锁定图元也进入 toggle。
    expect(internal.hitTester.getDrawingLineSegments).toHaveBeenCalledTimes(2)
    expect(setSelectedDrawingIds).toHaveBeenLastCalledWith(['locked', 'free'])
  })

  it('锁定图元仍进入标签就地编辑候选', () => {
    const locked = createDrawingObject({ id: 'locked', locked: true })
    const { adapter } = createSelectionAdapter([locked])
    const controller = new DrawingInteractionController(adapter)
    const findLabelTarget = vi.fn(() => null)
    stubDrawingControllerInternals(controller, { hit: null, findLabelTarget })

    expect(controller.getLineLabelTarget(pointerDown(10, 10), CONTAINER)).toBeNull()
    // 锁定只冻结拖动，文本编辑照常；锁定图元不再被候选集合剔除。
    expect(findLabelTarget).toHaveBeenCalledWith(10, 10, [locked], adapter)
  })

  it('拖拽连带组不携带锁定的已选图元', () => {
    const free = createDrawingObject({ id: 'free' })
    const locked = createDrawingObject({ id: 'locked', locked: true })
    const { adapter } = createSelectionAdapter([free, locked])
    const controller = new DrawingInteractionController(adapter)
    const internal = stubDrawingControllerInternals(controller, {
      hit: { drawing: free, target: { type: 'all' } },
    })
    adapter.setSelectedDrawingIds(['free', 'locked'])

    expect(controller.onPointerDown(pointerDown(10, 10), CONTAINER)).toBe(true)
    expect(internal.dragHandler.startDrag).toHaveBeenCalledWith([free], { type: 'all' }, 10, 10)
  })

  it('全局锁定时未锁定图元也不开始拖拽', () => {
    const free = createDrawingObject({ id: 'free' })
    const { adapter } = createSelectionAdapter([free], { globalLocked: true })
    const controller = new DrawingInteractionController(adapter)
    const internal = stubDrawingControllerInternals(controller, {
      hit: { drawing: free, target: { type: 'all' } },
    })

    expect(controller.onPointerDown(pointerDown(10, 10), CONTAINER)).toBe(true)
    expect(internal.dragHandler.startDrag).not.toHaveBeenCalled()
  })
})
