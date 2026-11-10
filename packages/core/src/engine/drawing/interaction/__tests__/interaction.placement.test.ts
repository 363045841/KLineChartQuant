/** 验证绘图落点：出界时贴 Pane 边界继续预览与落点，未来槽位与创建顺序不受影响。 */
import { describe, expect, it, vi } from 'vitest'

import {
  CONTAINER,
  createDrawingAdapter,
  createDrawingObject,
  createPlacementAdapter,
  pointerDown,
  pointerMove,
} from '../../__tests__/helpers/drawingTestKit'
import { DrawingInteractionController } from '../impl/interaction'
import { DrawingTool } from '../types'

describe('DrawingInteractionController placement', () => {
  it('clamps regression preview and confirmed endpoints to the last candle', () => {
    const createDrawing = vi.fn(() => createDrawingObject({ id: 'regression' }))
    const adapter = createDrawingAdapter({
      document: { getDrawingToolId: () => DrawingTool.RegressionChannel, createDrawing },
    })
    const controller = new DrawingInteractionController(adapter)
    controller.onPointerDown(pointerDown(5, 100), CONTAINER)

    // 包含绘图区右侧和轴区：进行中的预览始终贴在已有数据末端。
    for (const x of [95, 350]) {
      expect(controller.onPointerMove(pointerMove(x, 80), CONTAINER)).toBe(true)
      const preview = controller.getPaintOverlay()[0]
      expect(preview?.anchors.map((anchor) => anchor.time)).toEqual([500, 1_500])
    }

    controller.onPointerDown(pointerDown(95, 80), CONTAINER)
    expect(createDrawing).toHaveBeenCalledWith({
      kind: DrawingTool.RegressionChannel,
      paneId: 'main',
      anchors: [
        { timestamp: 500, price: 100 },
        { timestamp: 1_500, price: 120 },
      ],
      style: { stroke: '#2962ff', strokeWidth: 1, strokeStyle: 'solid' },
    })
  })

  it('通过公开坐标服务在右侧空白区创建绝对时间锚点', () => {
    const createdDrawing = createDrawingObject({ id: 'future-line' })
    const createDrawing = vi.fn(() => createdDrawing)
    const adapter = createDrawingAdapter({
      document: { getDrawingToolId: () => 'v-line', createDrawing, setDrawingToolId: vi.fn() },
    })
    const controller = new DrawingInteractionController(adapter)

    expect(controller.onPointerDown(pointerDown(55, 10), CONTAINER)).toBe(true)
    expect(createDrawing).toHaveBeenCalledWith({
      kind: 'vertical-line',
      paneId: 'main',
      anchors: [{ timestamp: 3000, price: 190 }],
      style: { stroke: '#2962ff', strokeWidth: 1, strokeStyle: 'solid' },
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

  it('keeps a single-anchor tool active for consecutive drawings', () => {
    const createDrawing = vi.fn(() => createDrawingObject({ id: 'created' }))
    const setDrawingToolId = vi.fn()
    const adapter = createPlacementAdapter({
      tool: 'v-line',
      pane: { paneId: 'main', top: 0, height: 100 },
      plotWidth: 100,
      plotHeight: 100,
      document: { createDrawing, setDrawingToolId },
    })
    const controller = new DrawingInteractionController(adapter)
    controller.setContinuousDrawing(true)

    controller.onPointerMove(pointerMove(10, 10), CONTAINER)
    expect(controller.getPaintOverlay()).toHaveLength(1)
    controller.onPointerDown(pointerDown(10, 10), CONTAINER)
    expect(controller.getPaintOverlay()).toHaveLength(0)
    controller.onPointerDown(pointerDown(20, 20), CONTAINER)
    expect(createDrawing).toHaveBeenCalledTimes(2)
    expect(setDrawingToolId).not.toHaveBeenCalled()

    controller.setContinuousDrawing(false)
    controller.onPointerDown(pointerDown(30, 30), CONTAINER)
    expect(setDrawingToolId).toHaveBeenCalledWith('cursor')
  })

  it('starts a fresh anchor group after completing a drawing in continuous mode', () => {
    const createDrawing = vi.fn(() => createDrawingObject({ id: 'created' }))
    const setDrawingToolId = vi.fn()
    const adapter = createPlacementAdapter({
      tool: 'trend-line',
      pane: { paneId: 'main', top: 0, height: 100 },
      plotWidth: 100,
      plotHeight: 100,
      document: { createDrawing, setDrawingToolId },
    })
    const controller = new DrawingInteractionController(adapter)
    controller.setContinuousDrawing(true)

    controller.onPointerDown(pointerDown(10, 10), CONTAINER)
    controller.onPointerMove(pointerMove(20, 20), CONTAINER)
    controller.onPointerDown(pointerDown(20, 20), CONTAINER)
    expect(controller.getPaintOverlay()).toHaveLength(0)
    controller.onPointerDown(pointerDown(30, 30), CONTAINER)
    expect(createDrawing).toHaveBeenCalledTimes(1)
    controller.onPointerDown(pointerDown(40, 40), CONTAINER)
    expect(createDrawing).toHaveBeenCalledTimes(2)
    expect(createDrawing).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        anchors: [expect.objectContaining({ price: 30 }), expect.objectContaining({ price: 40 })],
      }),
    )
    expect(setDrawingToolId).not.toHaveBeenCalled()
  })

  it('出界后在同一 Pane 边界预览并提交完整锚点', () => {
    const createDrawing = vi.fn(() => createDrawingObject({ id: 'created' }))
    const adapter = createPlacementAdapter({
      tool: 'trend-line',
      pane: { paneId: 'main', top: 0, height: 60 },
      plotWidth: 100,
      plotHeight: 100,
      document: { createDrawing, setDrawingToolId: vi.fn() },
    })
    const controller = new DrawingInteractionController(adapter)

    // 第一锚点落在 Pane 内，进入双锚点累积态。
    expect(controller.onPointerDown(pointerDown(20, 30), CONTAINER)).toBe(true)

    // 指针移出绘图区：预览保留，第二锚点贴到 Pane 下边界（价格 60）。
    expect(controller.onPointerMove(pointerMove(80, 250), CONTAINER)).toBe(true)
    const overlay = controller.getPaintOverlay()
    expect(overlay).toHaveLength(1)
    expect(overlay[0]!.anchors).toMatchObject([
      { time: 20, price: 30 },
      { time: 80, price: 60 },
    ])
    expect(controller.onPointerDown(pointerDown(80, 250), CONTAINER)).toBe(true)
    expect(createDrawing).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'trend-line',
        paneId: 'main',
        anchors: [
          expect.objectContaining({ timestamp: 20, price: 30 }),
          expect.objectContaining({ timestamp: 80, price: 60 }),
        ],
      }),
    )
  })
})

describe('DrawingInteractionController horizontal anchors', () => {
  it('水平线只保存价格', () => {
    const createdDrawing = createDrawingObject({ id: 'h-line' })
    const createDrawing = vi.fn(() => createdDrawing)
    const adapter = createPlacementAdapter({
      tool: 'h-line',
      pane: { paneId: 'main', top: 0, height: 100 },
      plotWidth: 100,
      plotHeight: 100,
      document: { createDrawing, setDrawingToolId: vi.fn() },
    })
    const controller = new DrawingInteractionController(adapter)

    expect(controller.onPointerDown(pointerDown(10, 10), CONTAINER)).toBe(true)
    expect(createDrawing).toHaveBeenCalledWith({
      kind: 'horizontal-line',
      paneId: 'main',
      anchors: [{ price: 10 }],
      style: { stroke: '#2962ff', strokeWidth: 1, strokeStyle: 'solid' },
    })
  })
})
