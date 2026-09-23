/** 验证绘图落点：出界时贴 Pane 边界继续预览与落点，未来槽位与创建顺序不受影响。 */
import { describe, expect, it, vi } from 'vitest'

import {
  CONTAINER,
  createDrawingObject,
  createPlacementAdapter,
  pointerDown,
  pointerMove,
} from '../../__tests__/helpers/drawingTestKit'
import { DrawingInteractionController } from '../impl/interaction'

describe('DrawingInteractionController placement', () => {
  it('passes the future-slot offset through when creating a drawing in the right blank area', () => {
    const createdDrawing = createDrawingObject({ id: 'future-line' })
    const createDrawing = vi.fn(() => createdDrawing)
    const adapter = createPlacementAdapter({
      tool: 'v-line',
      pane: { paneId: 'main', top: 0, height: 100 },
      plotWidth: 100,
      plotHeight: 100,
      logicalIndex: 3,
      document: { createDrawing, setDrawingToolId: vi.fn() },
    })
    const controller = new DrawingInteractionController(adapter)

    expect(controller.onPointerDown(pointerDown(10, 10), CONTAINER)).toBe(true)
    expect(createDrawing).toHaveBeenCalledWith({
      kind: 'vertical-line',
      paneId: 'main',
      anchors: [{ timestamp: 1, futureOffset: 3, price: 10 }],
    })
  })

  it('resets the tool before creating so the new selection is not cleared', () => {
    const createdDrawing = createDrawingObject({ id: 'created' })
    const calls: string[] = []
    const adapter = createPlacementAdapter({
      tool: 'v-line',
      pane: { paneId: 'main', top: 0, height: 100 },
      plotWidth: 100,
      plotHeight: 100,
      logicalIndex: 3,
      document: {
        createDrawing: vi.fn(() => {
          calls.push('createDrawing')
          return createdDrawing
        }),
        setDrawingToolId: vi.fn(() => {
          calls.push('setDrawingToolId')
        }),
      },
    })
    const controller = new DrawingInteractionController(adapter)

    expect(controller.onPointerDown(pointerDown(10, 10), CONTAINER)).toBe(true)
    // 切换工具会清空选中，必须发生在创建（原子选中新图元）之前。
    expect(calls).toEqual(['setDrawingToolId', 'createDrawing'])
  })

  it('keeps the in-progress preview and clamps the next anchor to the pane edge', () => {
    const adapter = createPlacementAdapter({
      tool: 'trend-line',
      pane: { paneId: 'main', top: 0, height: 60 },
      plotWidth: 100,
      plotHeight: 100,
      logicalIndex: 0,
    })
    const controller = new DrawingInteractionController(adapter)

    // 第一锚点落在 Pane 内，进入双锚点累积态。
    expect(controller.onPointerDown(pointerDown(20, 30), CONTAINER)).toBe(true)

    // 指针移出绘图区：预览保留，第二锚点贴到 Pane 下边界（价格 60）。
    expect(controller.onPointerMove(pointerMove(80, 250), CONTAINER)).toBe(true)
    const overlay = controller.getPaintOverlay()
    expect(overlay).toHaveLength(1)
    expect(overlay[0]!.anchors).toMatchObject([
      { time: 1, price: 30 },
      { time: 1, price: 60 },
    ])
  })

  it('completes the drawing at the clamped boundary when clicking outside the pane', () => {
    const createdDrawing = createDrawingObject({ id: 'created' })
    const createDrawing = vi.fn(() => createdDrawing)
    const adapter = createPlacementAdapter({
      tool: 'trend-line',
      pane: { paneId: 'main', top: 0, height: 60 },
      plotWidth: 100,
      plotHeight: 100,
      logicalIndex: 0,
      document: { createDrawing, setDrawingToolId: vi.fn() },
    })
    const controller = new DrawingInteractionController(adapter)

    expect(controller.onPointerDown(pointerDown(20, 30), CONTAINER)).toBe(true)
    expect(controller.onPointerDown(pointerDown(80, 250), CONTAINER)).toBe(true)
    expect(createDrawing).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'trend-line',
        paneId: 'main',
        anchors: [
          expect.objectContaining({ timestamp: 1, price: 30 }),
          expect.objectContaining({ timestamp: 1, price: 60 }),
        ],
      }),
    )
  })
})
