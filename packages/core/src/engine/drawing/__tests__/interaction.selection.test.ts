/** 验证 Ctrl 命中仅增删选择集合，不进入图元拖拽。 */
import { describe, expect, it, vi } from 'vitest'

import type { DrawingChartAdapter } from '../../../controllers/types'
import type { DrawingObject } from '../../../foundation/plugin'
import { DrawingInteractionController } from '../interaction'

/** 创建可被命中测试使用的最小图元。 */
function createDrawing(id: string): DrawingObject {
  return {
    id,
    kind: 'horizontal-line',
    paneId: 'main',
    visible: true,
    anchors: [],
    params: {},
    style: { stroke: '#2962ff' },
  }
}

/** 创建仅覆盖选择与命中路径的绘图 adapter。 */
function createAdapter(drawings: ReadonlyArray<DrawingObject>, tool: 'cursor' | 'box-select' = 'cursor') {
  let selectedIds: ReadonlyArray<string> = []
  const setSelectedDrawingIds = vi.fn((ids: ReadonlyArray<string>) => {
    selectedIds = [...ids]
  })
  const adapter = {
    getDrawingToolId: () => tool,
    getFullDrawings: () => drawings,
    getSelectedDrawingIds: () => selectedIds,
    setSelectedDrawingIds,
    commitDrawingDrags: vi.fn(),
    getDrawingData: () => [{ timestamp: 1 }],
    getViewport: () => ({ scrollLeft: 0, plotWidth: 100, plotHeight: 100 }),
    getPaneAtY: () => ({ paneId: 'main', top: 0, height: 100 }),
    getPaneInfo: () => ({ paneId: 'main', top: 0, height: 100 }),
    getLogicalIndexAtX: () => 0,
    getDrawingTimestampAtLogicalIndex: () => 1,
    getDrawingWorkspaceId: () => 'kline' as const,
    yToPrice: (_paneId: string, y: number) => y,
  } as unknown as DrawingChartAdapter
  return { adapter, setSelectedDrawingIds }
}

/** 构造命中测试所需的指针事件。 */
function pointerDown(ctrlKey: boolean): PointerEvent {
  return { clientX: 10, clientY: 10, ctrlKey } as PointerEvent
}

/** 构造框选拖拽过程中的指针事件。 */
function pointerAt(x: number, y: number): PointerEvent {
  return { clientX: x, clientY: y, ctrlKey: false } as PointerEvent
}

describe('DrawingInteractionController selection', () => {
  it('adds and removes hit drawings with Ctrl without starting a drag', () => {
    const first = createDrawing('first')
    const second = createDrawing('second')
    const { adapter, setSelectedDrawingIds } = createAdapter([first, second])
    const controller = new DrawingInteractionController(adapter)
    const internal = controller as unknown as {
      hitTester: { hitTest: ReturnType<typeof vi.fn> }
      dragHandler: { startDrag: ReturnType<typeof vi.fn> }
    }
    internal.hitTester = { hitTest: vi.fn(() => ({ drawing: second })) }
    internal.dragHandler.startDrag = vi.fn()
    adapter.setSelectedDrawingIds([first.id])
    const container = {
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    } as HTMLElement

    expect(controller.onPointerDown(pointerDown(true), container)).toBe(true)
    expect(setSelectedDrawingIds).toHaveBeenLastCalledWith(['first', 'second'])
    expect(internal.dragHandler.startDrag).not.toHaveBeenCalled()

    expect(controller.onPointerDown(pointerDown(true), container)).toBe(true)
    expect(setSelectedDrawingIds).toHaveBeenLastCalledWith(['first'])
    expect(internal.dragHandler.startDrag).not.toHaveBeenCalled()
  })

  it('toggles every drawing intersecting a selection marquee', () => {
    const first = createDrawing('first')
    const second = createDrawing('second')
    const third = createDrawing('third')
    const { adapter, setSelectedDrawingIds } = createAdapter(
      [first, second, third],
      'box-select',
    )
    const controller = new DrawingInteractionController(adapter)
    const internal = controller as unknown as {
      hitTester: { hitTest: ReturnType<typeof vi.fn>; getDrawingLineSegments: ReturnType<typeof vi.fn> }
    }
    internal.hitTester = {
      hitTest: vi.fn(() => null),
      getDrawingLineSegments: vi.fn((drawing: DrawingObject) => {
        if (drawing.id === 'third') return [{ a: { x: 50, y: 50 }, b: { x: 60, y: 60 } }]
        return [{ a: { x: 12, y: 12 }, b: { x: 28, y: 28 } }]
      }),
    }
    adapter.setSelectedDrawingIds([first.id])
    const container = {
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    } as HTMLElement

    expect(controller.onPointerDown(pointerAt(10, 10), container)).toBe(true)
    expect(controller.onPointerMove(pointerAt(30, 30), container)).toBe(true)
    expect(controller.onPointerUp(pointerAt(30, 30), container)).toBe(true)
    expect(setSelectedDrawingIds).toHaveBeenLastCalledWith(['second'])
    expect(controller.getSelectionMarquee()).toBeNull()
  })

  it('clears the current selection when box-select clicks blank space', () => {
    const drawing = createDrawing('selected')
    const { adapter, setSelectedDrawingIds } = createAdapter([drawing], 'box-select')
    const controller = new DrawingInteractionController(adapter)
    const container = {
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    } as HTMLElement
    adapter.setSelectedDrawingIds([drawing.id])

    expect(controller.onPointerDown(pointerAt(40, 40), container)).toBe(true)
    expect(controller.onPointerUp(pointerAt(40, 40), container)).toBe(true)
    expect(setSelectedDrawingIds).toHaveBeenLastCalledWith([])
  })

  it('drags every selected drawing when dragging a selected line', () => {
    const first = createDrawing('first')
    const second = createDrawing('second')
    const { adapter } = createAdapter([first, second])
    const controller = new DrawingInteractionController(adapter)
    const movedFirst = { ...first, anchors: [{ id: 'first-anchor', type: 'horizontal' as const, price: 11 }] }
    const movedSecond = { ...second, anchors: [{ id: 'second-anchor', type: 'horizontal' as const, price: 21 }] }
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
    const container = {
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    } as HTMLElement

    expect(controller.onPointerDown(pointerDown(false), container)).toBe(true)
    expect(startDrag).toHaveBeenCalledWith([first, second], undefined, 10, 10)
    expect(controller.onPointerMove(pointerAt(20, 20), container)).toBe(true)
    expect(controller.onPointerUp(pointerAt(20, 20), container)).toBe(true)
    expect(adapter.commitDrawingDrags).toHaveBeenCalledWith([
      { id: first.id, anchors: movedFirst.anchors },
      { id: second.id, anchors: movedSecond.anchors },
    ])
  })

  it('starts a group drag before marquee when box-select hits a selected drawing', () => {
    const first = createDrawing('first')
    const second = createDrawing('second')
    const { adapter } = createAdapter([first, second], 'box-select')
    const controller = new DrawingInteractionController(adapter)
    const startDrag = vi.fn()
    const internal = controller as unknown as {
      hitTester: { hitTest: ReturnType<typeof vi.fn> }
      dragHandler: { startDrag: ReturnType<typeof vi.fn> }
    }
    internal.hitTester = { hitTest: vi.fn(() => ({ drawing: first })) }
    internal.dragHandler.startDrag = startDrag
    adapter.setSelectedDrawingIds([first.id, second.id])
    const container = {
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    } as HTMLElement

    expect(controller.onPointerDown(pointerAt(10, 10), container)).toBe(true)
    expect(startDrag).toHaveBeenCalledWith([first, second], undefined, 10, 10)
    expect(controller.getSelectionMarquee()).toBeNull()
  })

  it('passes the future-slot offset through when creating a drawing in the right blank area', () => {
    const createdDrawing = createDrawing('future-line')
    const createDrawingCommand = vi.fn(() => createdDrawing)
    const adapter = {
      ...createAdapter([]).adapter,
      getDrawingToolId: () => 'v-line' as const,
      getLogicalIndexAtX: () => 3,
      getDrawingTimestampAtLogicalIndex: () => 1,
      createDrawing: createDrawingCommand,
      setDrawingToolId: vi.fn(),
    } as unknown as DrawingChartAdapter
    const controller = new DrawingInteractionController(adapter)
    const container = {
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    } as HTMLElement

    expect(controller.onPointerDown(pointerDown(false), container)).toBe(true)
    expect(createDrawingCommand).toHaveBeenCalledWith({
      kind: 'vertical-line',
      paneId: 'main',
      anchors: [{ timestamp: 1, futureOffset: 3, price: 10 }],
    })
  })
})
