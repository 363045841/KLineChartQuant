/** 验证 locked 图元的交互语义：可点选、可框选，但不参与拖动。 */
import { describe, expect, it, vi } from 'vitest'

import { DrawingInteractionController } from '../interaction'
import { CONTAINER, createDrawingObject, createSelectionAdapter } from './helpers/drawingTestKit'

describe('DrawingInteractionController locked drawings', () => {
  it('locked 图元可被点选，但不开始拖拽', () => {
    const locked = createDrawingObject({ id: 'locked', locked: true })
    const { adapter, setSelectedDrawingIds } = createSelectionAdapter([locked])
    const controller = new DrawingInteractionController(adapter)
    const hitTest = vi.fn(() => ({ drawing: locked, target: { type: 'all' } }))
    const startDrag = vi.fn()
    ;(controller as unknown as { hitTester: unknown; dragHandler: unknown }).hitTester = { hitTest }
    ;(controller as unknown as { dragHandler: unknown }).dragHandler = { startDrag }

    expect(controller.onPointerDown({ clientX: 10, clientY: 10 } as PointerEvent, CONTAINER)).toBe(
      true,
    )
    // 锁定图元进入命中候选，选中后不开拖；未选中时手柄不参与命中，因此选中集合为空。
    expect(hitTest).toHaveBeenCalledWith(10, 10, [locked], adapter, new Set())
    expect(setSelectedDrawingIds).toHaveBeenLastCalledWith(['locked'])
    expect(startDrag).not.toHaveBeenCalled()
  })

  it('locked 图元可被框选选中', () => {
    const locked = createDrawingObject({ id: 'locked', locked: true })
    const free = createDrawingObject({ id: 'free' })
    const { adapter, setSelectedDrawingIds } = createSelectionAdapter([locked, free], {
      tool: 'box-select',
    })
    const controller = new DrawingInteractionController(adapter)
    const getDrawingLineSegments = vi.fn(() => [{ a: { x: 12, y: 12 }, b: { x: 28, y: 28 } }])
    ;(controller as unknown as { hitTester: unknown }).hitTester = {
      hitTest: vi.fn(() => null),
      getDrawingLineSegments,
    }

    expect(controller.onPointerDown({ clientX: 10, clientY: 10 } as PointerEvent, CONTAINER)).toBe(
      true,
    )
    expect(controller.onPointerMove({ clientX: 30, clientY: 30 } as PointerEvent, CONTAINER)).toBe(
      true,
    )
    expect(controller.onPointerUp({ clientX: 30, clientY: 30 } as PointerEvent, CONTAINER)).toBe(
      true,
    )
    // 框选几何对两个图元都求交，锁定图元也进入 toggle。
    expect(getDrawingLineSegments).toHaveBeenCalledTimes(2)
    expect(setSelectedDrawingIds).toHaveBeenLastCalledWith(['locked', 'free'])
  })

  it('拖拽连带组不携带锁定的已选图元', () => {
    const free = createDrawingObject({ id: 'free' })
    const locked = createDrawingObject({ id: 'locked', locked: true })
    const { adapter } = createSelectionAdapter([free, locked])
    const controller = new DrawingInteractionController(adapter)
    const startDrag = vi.fn()
    ;(controller as unknown as { hitTester: unknown; dragHandler: unknown }).hitTester = {
      hitTest: vi.fn(() => ({ drawing: free, target: { type: 'all' } })),
    }
    ;(controller as unknown as { dragHandler: unknown }).dragHandler = { startDrag }
    adapter.setSelectedDrawingIds(['free', 'locked'])

    expect(controller.onPointerDown({ clientX: 10, clientY: 10 } as PointerEvent, CONTAINER)).toBe(
      true,
    )
    expect(startDrag).toHaveBeenCalledWith([free], { type: 'all' }, 10, 10)
  })
})
