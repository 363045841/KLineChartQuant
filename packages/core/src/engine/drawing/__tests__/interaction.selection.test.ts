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
function createAdapter(drawings: ReadonlyArray<DrawingObject>) {
  let selectedIds: ReadonlyArray<string> = []
  const setSelectedDrawingIds = vi.fn((ids: ReadonlyArray<string>) => {
    selectedIds = [...ids]
  })
  const adapter = {
    getDrawingToolId: () => 'cursor' as const,
    getFullDrawings: () => drawings,
    getSelectedDrawingIds: () => selectedIds,
    setSelectedDrawingIds,
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
