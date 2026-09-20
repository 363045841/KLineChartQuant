/**
 * 验证线段中点垂直手柄：拖拽只沿价格轴平移这条线（时间与另一条线不变）。
 * 手柄由线表 LINES 的 verticalHandle 声明开启，未开启的线（parallel-channel）不响应手柄拖拽。
 */
import { describe, expect, it } from 'vitest'

import { DragHandler } from '../DragHandler'
import {
  CONTAINER,
  createDisjointChannelDrawing,
  createFlatLineDrawing,
  createFourBarTimelineAdapter,
  createParallelChannelDrawing,
  pointerMove,
} from './helpers/drawingTestKit'

/** 线性价格轴：价格 → y = 200 - price。 */
const adapter = createFourBarTimelineAdapter()

/** 对数价格轴：价格 → y = 200 - 10·ln(price)，用于验证手柄按价格增量而非屏幕位移平移。 */
const logAdapter = createFourBarTimelineAdapter({
  priceToY: (_paneId: string, price: number) => 200 - Math.log(price) * 10,
  yToPrice: (_paneId: string, y: number) => Math.exp((200 - y) / 10),
})

describe('DragHandler vertical handle', () => {
  it('translates the slanted line in price only, leaving the flat line untouched', () => {
    const handler = new DragHandler()
    handler.startDrag([createFlatLineDrawing()], { type: 'vertical-handle', lineIndex: 0 }, 10, 80)

    // 斜线中点 (10,80) 拖到 (35,60)：价格 +20，X 位移被忽略。
    const updated = handler.handleDragMove(pointerMove(35, 60), CONTAINER, adapter)

    expect(updated?.[0]?.anchors.map((anchor) => anchor.price)).toEqual([120, 160, 60, 60])
    expect(updated?.[0]?.anchors.map((anchor) => anchor.time)).toEqual([500, 1_000, 500, 1_000])
  })

  it('translates the flat line in price only, leaving the slanted line untouched', () => {
    const handler = new DragHandler()
    handler.startDrag([createFlatLineDrawing()], { type: 'vertical-handle', lineIndex: 1 }, 10, 140)

    // 水平线中点 (10,140) 拖到 (10,120)：价格 +20，斜线两点不动。
    const updated = handler.handleDragMove(pointerMove(10, 120), CONTAINER, adapter)

    expect(updated?.[0]?.anchors.map((anchor) => anchor.price)).toEqual([100, 140, 80, 80])
  })

  it('moves the second line of a disjoint channel without breaking the mirrored geometry', () => {
    const handler = new DragHandler()
    handler.startDrag(
      [createDisjointChannelDrawing()],
      { type: 'vertical-handle', lineIndex: 1 },
      10,
      160,
    )

    // 第二条线中点 (10,160) 拖到 (10,130)：价格 +30；第一条线与其镜像不变量保持不变。
    const updated = handler.handleDragMove(pointerMove(10, 130), CONTAINER, adapter)

    expect(updated?.[0]?.anchors.map((anchor) => anchor.price)).toEqual([100, 140, 50, 90])
    expect(updated?.[0]?.anchors.map((anchor) => anchor.time)).toEqual([500, 1_000, 1_000, 500])
    const anchors = updated![0]!.anchors
    expect((anchors[2]?.price ?? 0) - (anchors[3]?.price ?? 0)).toBeCloseTo(
      -((anchors[1]?.price ?? 0) - (anchors[0]?.price ?? 0)),
    )
  })

  it('translates only the dragged line of a parallel channel', () => {
    const handler = new DragHandler()
    handler.startDrag(
      [createParallelChannelDrawing()],
      { type: 'vertical-handle', lineIndex: 0 },
      10,
      80,
    )

    // 第一条线中点 (10,80) 拖到 (10,60)：价格 +20，第二条线不动（通道宽度随之改变）。
    const updated = handler.handleDragMove(pointerMove(10, 60), CONTAINER, adapter)

    expect(updated?.[0]?.anchors.map((anchor) => anchor.price)).toEqual([120, 160, 60, 100])
    expect(updated?.[0]?.anchors.map((anchor) => anchor.time)).toEqual([500, 1_000, 500, 1_000])
  })

  it('applies the same price increment to both anchors on a non-linear price axis', () => {
    const handler = new DragHandler()
    handler.startDrag(
      [createFlatLineDrawing()],
      { type: 'vertical-handle', lineIndex: 0 },
      10,
      153.9,
    )

    const updated = handler.handleDragMove(pointerMove(10, 140), CONTAINER, logAdapter)

    // 同步价格增量：两锚点的价格差（40）保持不变，而不是屏幕位移。
    const anchors = updated![0]!.anchors
    expect((anchors[1]?.price ?? 0) - (anchors[0]?.price ?? 0)).toBeCloseTo(40, 5)
    expect(anchors[0]?.time).toEqual(500)
  })
})
