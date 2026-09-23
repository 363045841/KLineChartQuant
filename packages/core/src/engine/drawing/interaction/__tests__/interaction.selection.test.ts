/** 验证 Ctrl/Shift 命中仅增删选择集合，不进入图元拖拽。 */
import { describe, expect, it, vi } from 'vitest'
import {
  CONTAINER,
  createDrawingObject,
  createPlacementAdapter,
  createSelectionAdapter,
  pointerDown,
  pointerMove,
  stubDrawingControllerInternals,
} from '../../__tests__/helpers/drawingTestKit'
import type { DrawingObject } from '../../types'
import { DrawingInteractionController } from '../impl/interaction'

describe('DrawingInteractionController selection', () => {
  it('adds and removes hit drawings with Shift using the same toggle semantics as Ctrl', () => {
    const first = createDrawingObject({ id: 'first' })
    const second = createDrawingObject({ id: 'second' })
    const { adapter, setSelectedDrawingIds } = createSelectionAdapter([first, second])
    const controller = new DrawingInteractionController(adapter)
    const internal = stubDrawingControllerInternals(controller, {
      hit: { drawing: second, target: { type: 'all' } },
    })
    adapter.setSelectedDrawingIds([first.id])
    const container = CONTAINER

    // Shift 点击命中：切换选中且不开拖拽，与 Ctrl 语义一致。
    expect(controller.onPointerDown(pointerDown(10, 10, { shiftKey: true }), container)).toBe(true)
    expect(setSelectedDrawingIds).toHaveBeenLastCalledWith(['first', 'second'])
    expect(internal.dragHandler.startDrag).not.toHaveBeenCalled()

    expect(controller.onPointerDown(pointerDown(10, 10, { shiftKey: true }), container)).toBe(true)
    expect(setSelectedDrawingIds).toHaveBeenLastCalledWith(['first'])
  })

  it('keeps the current selection when Shift-clicking blank space', () => {
    const drawing = createDrawingObject({ id: 'selected' })
    const { adapter, setSelectedDrawingIds } = createSelectionAdapter([drawing])
    const controller = new DrawingInteractionController(adapter)
    stubDrawingControllerInternals(controller, { hit: null })
    adapter.setSelectedDrawingIds([drawing.id])
    const container = CONTAINER

    // Shift 按住时空白点击不清空选择（与 Ctrl 一致）。
    expect(controller.onPointerDown(pointerDown(10, 10, { shiftKey: true }), container)).toBe(false)
    expect(setSelectedDrawingIds).not.toHaveBeenLastCalledWith([])
    expect(adapter.getSelectedDrawingIds()).toEqual([drawing.id])
  })

  it('adds and removes hit drawings with Ctrl without starting a drag', () => {
    const first = createDrawingObject({ id: 'first' })
    const second = createDrawingObject({ id: 'second' })
    const { adapter, setSelectedDrawingIds } = createSelectionAdapter([first, second])
    const controller = new DrawingInteractionController(adapter)
    const internal = stubDrawingControllerInternals(controller, {
      hit: { drawing: second, target: { type: 'all' } },
    })
    adapter.setSelectedDrawingIds([first.id])
    const container = CONTAINER

    expect(controller.onPointerDown(pointerDown(10, 10, { ctrlKey: true }), container)).toBe(true)
    expect(setSelectedDrawingIds).toHaveBeenLastCalledWith(['first', 'second'])
    expect(internal.dragHandler.startDrag).not.toHaveBeenCalled()

    expect(controller.onPointerDown(pointerDown(10, 10, { ctrlKey: true }), container)).toBe(true)
    expect(setSelectedDrawingIds).toHaveBeenLastCalledWith(['first'])
    expect(internal.dragHandler.startDrag).not.toHaveBeenCalled()
  })

  it('toggles every drawing intersecting a selection marquee', () => {
    const first = createDrawingObject({ id: 'first' })
    const second = createDrawingObject({ id: 'second' })
    const third = createDrawingObject({ id: 'third' })
    const { adapter, setSelectedDrawingIds } = createSelectionAdapter([first, second, third], {
      tool: 'box-select',
    })
    const controller = new DrawingInteractionController(adapter)
    const internal = stubDrawingControllerInternals(controller, { hit: null })
    internal.hitTester.getDrawingLineSegments = vi.fn((drawing: DrawingObject) => {
      if (drawing.id === 'third') return [{ a: { x: 50, y: 50 }, b: { x: 60, y: 60 } }]
      return [{ a: { x: 12, y: 12 }, b: { x: 28, y: 28 } }]
    })
    adapter.setSelectedDrawingIds([first.id])
    const container = CONTAINER

    expect(controller.onPointerDown(pointerMove(10, 10), container)).toBe(true)
    expect(controller.onPointerMove(pointerMove(30, 30), container)).toBe(true)
    expect(controller.onPointerUp(pointerMove(30, 30), container)).toBe(true)
    expect(setSelectedDrawingIds).toHaveBeenLastCalledWith(['second'])
    expect(controller.getSelectionMarquee()).toBeNull()
  })

  it('clears the current selection when box-select clicks blank space', () => {
    const drawing = createDrawingObject({ id: 'selected' })
    const { adapter, setSelectedDrawingIds } = createSelectionAdapter([drawing], {
      tool: 'box-select',
    })
    const controller = new DrawingInteractionController(adapter)
    const container = CONTAINER
    adapter.setSelectedDrawingIds([drawing.id])

    expect(controller.onPointerDown(pointerMove(40, 40), container)).toBe(true)
    expect(controller.onPointerUp(pointerMove(40, 40), container)).toBe(true)
    expect(setSelectedDrawingIds).toHaveBeenLastCalledWith([])
  })

  it('drags every selected drawing when dragging a selected line', () => {
    const first = createDrawingObject({ id: 'first' })
    const second = createDrawingObject({ id: 'second' })
    const { adapter } = createSelectionAdapter([first, second])
    const controller = new DrawingInteractionController(adapter)
    const movedFirst = {
      ...first,
      anchors: [{ id: 'first-anchor', type: 'horizontal' as const, price: 11 }],
    }
    const movedSecond = {
      ...second,
      anchors: [{ id: 'second-anchor', type: 'horizontal' as const, price: 21 }],
    }
    const startDrag = vi.fn()
    stubDrawingControllerInternals(controller, {
      hit: { drawing: first, target: { type: 'all' } },
      draggingIds: [first.id, second.id],
      movedDrawings: [movedFirst, movedSecond],
      startDrag,
    })
    adapter.setSelectedDrawingIds([first.id, second.id])
    const container = CONTAINER

    expect(controller.onPointerDown(pointerDown(10, 10), container)).toBe(true)
    expect(startDrag).toHaveBeenCalledWith([first, second], { type: 'all' }, 10, 10)
    expect(controller.onPointerMove(pointerMove(20, 20), container)).toBe(true)
    expect(controller.onPointerUp(pointerMove(20, 20), container)).toBe(true)
    expect(adapter.commitDrawingDrags).toHaveBeenCalledWith([
      { id: first.id, anchors: movedFirst.anchors },
      { id: second.id, anchors: movedSecond.anchors },
    ])
  })

  it('starts a group drag before marquee when box-select hits a selected drawing', () => {
    const first = createDrawingObject({ id: 'first' })
    const second = createDrawingObject({ id: 'second' })
    const { adapter } = createSelectionAdapter([first, second], { tool: 'box-select' })
    const controller = new DrawingInteractionController(adapter)
    const startDrag = vi.fn()
    stubDrawingControllerInternals(controller, {
      hit: { drawing: first, target: { type: 'all' } },
      startDrag,
    })
    adapter.setSelectedDrawingIds([first.id, second.id])
    const container = CONTAINER

    expect(controller.onPointerDown(pointerMove(10, 10), container)).toBe(true)
    expect(startDrag).toHaveBeenCalledWith([first, second], { type: 'all' }, 10, 10)
    expect(controller.getSelectionMarquee()).toBeNull()
  })

  it('freezes and unfreezes the hover target across a drawing drag', () => {
    const drawing = createDrawingObject({ id: 'subject' })
    const freeze = vi.fn()
    const unfreeze = vi.fn()
    const adapter = createPlacementAdapter(
      {
        tool: 'cursor',
        pane: { paneId: 'main', top: 0, height: 100 },
        plotWidth: 100,
        plotHeight: 100,
        logicalIndex: 0,
        session: { freezeHoverTarget: freeze, unfreezeHoverTarget: unfreeze },
      },
      [drawing],
    )
    const controller = new DrawingInteractionController(adapter)
    stubDrawingControllerInternals(controller, {
      hit: { drawing, target: { type: 'anchor', index: 0 } },
      draggingIds: [drawing.id],
      movedDrawings: [drawing],
    })
    const container = CONTAINER

    // 拖拽会话：按下时冻结悬停目标，抬起时解冻；中途不重复调用。
    expect(freeze).not.toHaveBeenCalled()
    expect(controller.onPointerDown(pointerDown(10, 10), container)).toBe(true)
    expect(freeze).toHaveBeenCalledTimes(1)
    expect(controller.onPointerMove(pointerMove(40, 40), container)).toBe(true)
    expect(freeze).toHaveBeenCalledTimes(1)
    expect(unfreeze).not.toHaveBeenCalled()
    expect(controller.onPointerUp(pointerMove(40, 40), container)).toBe(true)
    expect(unfreeze).toHaveBeenCalledTimes(1)
  })
})
