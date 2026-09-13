/** 验证 locked 图元的交互强制：不可点选、不可框选、不参与连带拖拽。 */
import { describe, expect, it, vi } from 'vitest'

import type { DrawingChartAdapter } from '../../../controllers/types'
import type { DrawingObject } from '../../../foundation/plugin'
import { DrawingInteractionController } from '../interaction'

/** 创建可被命中测试使用的最小图元；locked 控制锁定标记。 */
function createDrawing(id: string, locked = false): DrawingObject {
  return {
    id,
    kind: 'horizontal-line',
    paneId: 'main',
    visible: true,
    ...(locked ? { locked: true } : {}),
    anchors: [],
    params: {},
    style: { stroke: '#2962ff' },
  }
}

/** 创建仅覆盖选择与命中路径的绘图 adapter。 */
function createAdapter(
  drawings: ReadonlyArray<DrawingObject>,
  tool: 'cursor' | 'box-select' = 'cursor',
) {
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

const CONTAINER = {
  getBoundingClientRect: () => ({ left: 0, top: 0 }),
} as HTMLElement

describe('DrawingInteractionController locked drawings', () => {
  it('locked 图元不进入命中候选，点击视同空白并清空选中', () => {
    const locked = createDrawing('locked', true)
    const { adapter, setSelectedDrawingIds } = createAdapter([locked])
    const controller = new DrawingInteractionController(adapter)
    const hitTest = vi.fn(() => null)
    ;(controller as unknown as { hitTester: { hitTest: typeof hitTest } }).hitTester = { hitTest }
    adapter.setSelectedDrawingIds(['locked'])

    expect(controller.onPointerDown({ clientX: 10, clientY: 10 } as PointerEvent, CONTAINER)).toBe(
      false,
    )
    // 命中候选在传入 hitTester 前已滤除 locked 图元。
    expect(hitTest).toHaveBeenCalledWith(10, 10, [], adapter)
    expect(setSelectedDrawingIds).toHaveBeenLastCalledWith([])
  })

  it('locked 图元不被框选选中', () => {
    const locked = createDrawing('locked', true)
    const free = createDrawing('free')
    const { adapter, setSelectedDrawingIds } = createAdapter([locked, free], 'box-select')
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
    // 框选几何只对未锁定的 free 图元求交，locked 不进入 toggle。
    expect(getDrawingLineSegments).toHaveBeenCalledTimes(1)
    expect(getDrawingLineSegments).toHaveBeenCalledWith(free, adapter)
    expect(setSelectedDrawingIds).toHaveBeenLastCalledWith(['free'])
  })

  it('拖拽连带组不携带锁定的已选图元', () => {
    const free = createDrawing('free')
    const locked = createDrawing('locked', true)
    const { adapter } = createAdapter([free, locked])
    const controller = new DrawingInteractionController(adapter)
    const startDrag = vi.fn()
    ;(controller as unknown as { hitTester: unknown; dragHandler: unknown }).hitTester = {
      hitTest: vi.fn(() => ({ drawing: free })),
    }
    ;(controller as unknown as { dragHandler: unknown }).dragHandler = { startDrag }
    adapter.setSelectedDrawingIds(['free', 'locked'])

    expect(controller.onPointerDown({ clientX: 10, clientY: 10 } as PointerEvent, CONTAINER)).toBe(
      true,
    )
    expect(startDrag).toHaveBeenCalledWith([free], undefined, 10, 10)
  })
})
