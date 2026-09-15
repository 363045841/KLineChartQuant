/** 验证 Ctrl/Shift 命中仅增删选择集合，不进入图元拖拽。 */
import { describe, expect, it, vi } from 'vitest'

import type { DrawingChartAdapter } from '../../../controllers/types'
import type { DrawingObject } from '../../../foundation/plugin'
import { DrawingInteractionController } from '../interaction'
import {
  CONTAINER,
  createDrawingObject,
  createSelectionAdapter,
  pointerDown,
  pointerMove,
} from './helpers/drawingTestKit'

describe('DrawingInteractionController selection', () => {
  it('adds and removes hit drawings with Shift using the same toggle semantics as Ctrl', () => {
    const first = createDrawingObject({ id: 'first' })
    const second = createDrawingObject({ id: 'second' })
    const { adapter, setSelectedDrawingIds } = createSelectionAdapter([first, second])
    const controller = new DrawingInteractionController(adapter)
    const internal = controller as unknown as {
      hitTester: { hitTest: ReturnType<typeof vi.fn> }
      dragHandler: { startDrag: ReturnType<typeof vi.fn> }
    }
    internal.hitTester = { hitTest: vi.fn(() => ({ drawing: second })) }
    internal.dragHandler.startDrag = vi.fn()
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
    ;(controller as unknown as { hitTester: unknown }).hitTester = {
      hitTest: vi.fn(() => null),
    }
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
    const internal = controller as unknown as {
      hitTester: { hitTest: ReturnType<typeof vi.fn> }
      dragHandler: { startDrag: ReturnType<typeof vi.fn> }
    }
    internal.hitTester = { hitTest: vi.fn(() => ({ drawing: second })) }
    internal.dragHandler.startDrag = vi.fn()
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
    const internal = controller as unknown as {
      hitTester: {
        hitTest: ReturnType<typeof vi.fn>
        getDrawingLineSegments: ReturnType<typeof vi.fn>
      }
    }
    internal.hitTester = {
      hitTest: vi.fn(() => null),
      getDrawingLineSegments: vi.fn((drawing: DrawingObject) => {
        if (drawing.id === 'third') return [{ a: { x: 50, y: 50 }, b: { x: 60, y: 60 } }]
        return [{ a: { x: 12, y: 12 }, b: { x: 28, y: 28 } }]
      }),
    }
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
    const internal = controller as unknown as {
      hitTester: { hitTest: ReturnType<typeof vi.fn> }
      dragHandler: {
        isDragging: ReturnType<typeof vi.fn>
        getDraggingDrawingIds: ReturnType<typeof vi.fn>
        startDrag: ReturnType<typeof vi.fn>
        handleDragMove: ReturnType<typeof vi.fn>
        endDrag: ReturnType<typeof vi.fn>
      }
    }
    internal.hitTester = { hitTest: vi.fn(() => ({ drawing: first })) }
    internal.dragHandler = {
      isDragging: vi.fn(() => startDrag.mock.calls.length > 0),
      getDraggingDrawingIds: vi.fn(() => [first.id, second.id]),
      startDrag,
      handleDragMove: vi.fn(() => [movedFirst, movedSecond]),
      endDrag: vi.fn(),
    }
    adapter.setSelectedDrawingIds([first.id, second.id])
    const container = CONTAINER

    expect(controller.onPointerDown(pointerDown(10, 10), container)).toBe(true)
    expect(startDrag).toHaveBeenCalledWith([first, second], undefined, 10, 10)
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
    const internal = controller as unknown as {
      hitTester: { hitTest: ReturnType<typeof vi.fn> }
      dragHandler: { startDrag: ReturnType<typeof vi.fn> }
    }
    internal.hitTester = { hitTest: vi.fn(() => ({ drawing: first })) }
    internal.dragHandler.startDrag = startDrag
    adapter.setSelectedDrawingIds([first.id, second.id])
    const container = CONTAINER

    expect(controller.onPointerDown(pointerMove(10, 10), container)).toBe(true)
    expect(startDrag).toHaveBeenCalledWith([first, second], undefined, 10, 10)
    expect(controller.getSelectionMarquee()).toBeNull()
  })

  it('passes the future-slot offset through when creating a drawing in the right blank area', () => {
    const createdDrawing = createDrawingObject({ id: 'future-line' })
    const createDrawingCommand = vi.fn(() => createdDrawing)
    const adapter = {
      ...createSelectionAdapter([]).adapter,
      getDrawingToolId: () => 'v-line' as const,
      getLogicalIndexAtX: () => 3,
      getDrawingTimestampAtLogicalIndex: () => 1,
      createDrawing: createDrawingCommand,
      setDrawingToolId: vi.fn(),
    } as unknown as DrawingChartAdapter
    const controller = new DrawingInteractionController(adapter)
    const container = CONTAINER

    expect(controller.onPointerDown(pointerDown(10, 10), container)).toBe(true)
    expect(createDrawingCommand).toHaveBeenCalledWith({
      kind: 'vertical-line',
      paneId: 'main',
      anchors: [{ timestamp: 1, futureOffset: 3, price: 10 }],
    })
  })

  it('resets the tool before creating so the new selection is not cleared', () => {
    const createdDrawing = createDrawingObject({ id: 'created' })
    const calls: string[] = []
    const adapter = {
      ...createSelectionAdapter([]).adapter,
      getDrawingToolId: () => 'v-line' as const,
      getLogicalIndexAtX: () => 3,
      getDrawingTimestampAtLogicalIndex: () => 1,
      createDrawing: vi.fn(() => {
        calls.push('createDrawing')
        return createdDrawing
      }),
      setDrawingToolId: vi.fn(() => {
        calls.push('setDrawingToolId')
      }),
    } as unknown as DrawingChartAdapter
    const controller = new DrawingInteractionController(adapter)
    const container = CONTAINER

    expect(controller.onPointerDown(pointerDown(10, 10), container)).toBe(true)
    // 切换工具会清空选中，必须发生在创建（原子选中新图元）之前。
    expect(calls).toEqual(['setDrawingToolId', 'createDrawing'])
  })
})
