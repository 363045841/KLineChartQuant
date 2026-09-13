/** 验证公开命中查询 hitTestAt：坐标换算、候选过滤与空结果语义。 */
import { describe, expect, it, vi } from 'vitest'

import type { DrawingChartAdapter } from '../../../controllers/types'
import type { DrawingObject } from '../../../foundation/plugin'
import { DrawingInteractionController } from '../interaction'

/** 创建可被命中测试使用的最小图元。 */
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

/** 创建覆盖 hitTestAt 路径的最小 adapter（main pane top=40，模拟上方有时间轴等占位）。 */
function createAdapter(drawings: ReadonlyArray<DrawingObject>, paneTop: number) {
  const adapter = {
    getDrawingToolId: () => 'cursor',
    getFullDrawings: () => drawings,
    getSelectedDrawingIds: () => [] as string[],
    setSelectedDrawingIds: vi.fn(),
    getDrawingData: () => [{ timestamp: 1 }],
    getViewport: () => ({ scrollLeft: 0, plotWidth: 100, plotHeight: 200 }),
    getPaneAtY: () => ({ paneId: 'main', top: paneTop, height: 160 }),
    getPaneInfo: () => ({ paneId: 'main', top: paneTop, height: 160 }),
    getLogicalIndexAtX: () => 0,
    getDrawingTimestampAtLogicalIndex: () => 1,
    getDrawingWorkspaceId: () => 'kline' as const,
    yToPrice: (_paneId: string, y: number) => y,
  } as unknown as DrawingChartAdapter
  return { adapter }
}

describe('DrawingInteractionController hitTestAt', () => {
  it('把容器局部 Y 换算为 Pane 局部 Y 后查询，命中返回图元', () => {
    const free = createDrawing('free')
    const locked = createDrawing('locked', true)
    const { adapter } = createAdapter([free, locked], 40)
    const controller = new DrawingInteractionController(adapter)
    const hitTest = vi.fn(() => ({ drawing: free }))
    ;(controller as unknown as { hitTester: { hitTest: typeof hitTest } }).hitTester = { hitTest }

    expect(controller.hitTestAt(20, 55)).toBe(free)
    // y=55 减 pane.top=40 后以 Pane 局部 15 查询；锁定图元不进入候选。
    expect(hitTest).toHaveBeenCalledWith(20, 15, [free], adapter)
  })

  it('未命中或 Pane 不可解析时返回 null', () => {
    const drawing = createDrawing('only')
    const { adapter } = createAdapter([drawing], 40)
    const controller = new DrawingInteractionController(adapter)
    ;(controller as unknown as { hitTester: unknown }).hitTester = {
      hitTest: vi.fn(() => null),
    }
    expect(controller.hitTestAt(20, 55)).toBeNull()

    const noPaneAdapter = {
      ...adapter,
      getPaneAtY: () => undefined,
    } as unknown as DrawingChartAdapter
    const noPaneController = new DrawingInteractionController(noPaneAdapter)
    expect(noPaneController.hitTestAt(20, 55)).toBeNull()
  })
})
