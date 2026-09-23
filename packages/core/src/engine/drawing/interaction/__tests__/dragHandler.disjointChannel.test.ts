/**
 * 验证不相交通道（disjoint-channel）拖拽策略。
 * 同 X 配对为 0↔3、1↔2：拖任一端点时伙伴跟随时间轴、价格反向，另外两点固定。
 */
import { describe, expect, it } from 'vitest'
import {
  CONTAINER,
  createDisjointChannelDrawing,
  createFourBarTimelineAdapter,
  pointerMove,
} from '../../__tests__/helpers/drawingTestKit'
import type { DrawingObject } from '../../types'
import { DragHandler } from '../impl/DragHandler'

/** 坐标约定：索引 i → x = i*10+5，价格 → y = 200 - price。 */
const adapter = createFourBarTimelineAdapter()

/** 断言创建期不变量在拖拽后仍成立：同 X 配对 0↔3、1↔2，且两条线斜率互为相反数。 */
function expectMirroredChannel(anchors: DrawingObject['anchors']): void {
  expect(anchors[3]?.time).toEqual(anchors[0]?.time)
  expect(anchors[2]?.time).toEqual(anchors[1]?.time)
  expect((anchors[2]?.price ?? 0) - (anchors[3]?.price ?? 0)).toBeCloseTo(
    -((anchors[1]?.price ?? 0) - (anchors[0]?.price ?? 0)),
  )
}

describe('DragHandler disjoint channel', () => {
  it('mirrors the same-X anchor and keeps both lines aligned', () => {
    const handler = new DragHandler()
    handler.startDrag([createDisjointChannelDrawing()], { type: 'anchor', index: 0 }, 5, 100)

    const updated = handler.handleDragMove(pointerMove(25, 70), CONTAINER, adapter)

    // p0 移到 (25,70) 即 time 1500 / price 130：p3 时间跟随、价格反向，p1/p2 不动。
    expect(updated?.[0]?.anchors.map((anchor) => anchor.time)).toEqual([1_500, 1_000, 1_000, 1_500])
    expect(updated?.[0]?.anchors.map((anchor) => anchor.price)).toEqual([130, 140, 20, 30])
    expectMirroredChannel(updated![0]!.anchors)
  })

  it('mirrors the first line when dragging the second line endpoint', () => {
    const handler = new DragHandler()
    handler.startDrag([createDisjointChannelDrawing()], { type: 'anchor', index: 2 }, 15, 180)

    const updated = handler.handleDragMove(pointerMove(25, 60), CONTAINER, adapter)

    // p2 移到 (25,60) 即 price 140：p1 时间跟随、价格反向，p0/p3 不动。
    expect(updated?.[0]?.anchors.map((anchor) => anchor.time)).toEqual([500, 1_500, 1_500, 500])
    expect(updated?.[0]?.anchors.map((anchor) => anchor.price)).toEqual([100, 20, 140, 60])
    expectMirroredChannel(updated![0]!.anchors)
  })

  it('translates every anchor when dragging the whole drawing', () => {
    const handler = new DragHandler()
    handler.startDrag([createDisjointChannelDrawing()], { type: 'all' }, 5, 100)

    const updated = handler.handleDragMove(pointerMove(15, 70), CONTAINER, adapter)

    // 整体平移 (+10px 时间 / +30px 价格)：四个锚点保持相对位置。
    expect(updated?.[0]?.anchors.map((anchor) => anchor.time)).toEqual([1_000, 1_500, 1_500, 1_000])
    expect(updated?.[0]?.anchors.map((anchor) => anchor.price)).toEqual([130, 170, 50, 90])
    expectMirroredChannel(updated![0]!.anchors)
  })
})
