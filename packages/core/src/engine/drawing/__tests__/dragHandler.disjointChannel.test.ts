/**
 * 验证不相交通道（disjoint-channel）拖拽策略。
 * 同 X 配对为 0↔3、1↔2：拖任一端点时伙伴跟随时间轴、价格反向，另外两点固定。
 */
import { describe, expect, it } from 'vitest'

import type { DrawingObject } from '../../../foundation/plugin'
import { DragHandler } from '../DragHandler'
import { CONTAINER, createDrawingAdapter, pointerMove } from './helpers/drawingTestKit'

/** 四个 Bar 的时间轴，保证四个锚点都能投影。 */
const TIMESTAMPS = [500, 1_000, 1_500, 2_000]

/** 坐标约定：索引 i → x = i*10+5，价格 → y = 200 - price。 */
const adapter = createDrawingAdapter({
  viewport: {
    getDrawingData: () => TIMESTAMPS.map((timestamp) => ({ timestamp })),
    getDrawingTimestampAtLogicalIndex: (index) => TIMESTAMPS[index] ?? null,
    getLogicalIndexAtTimestamp: (timestamp) => {
      const index = TIMESTAMPS.indexOf(timestamp)
      return index >= 0 ? index : null
    },
  },
})

/**
 * 不相交通道：0/1 为第一条线，2/3 为第二条线（斜率取反、同 X 反向连接）。
 * 屏幕位置：0 (5,100)、1 (15,60)、2 (15,180)、3 (5,140)。
 */
function createDisjointChannel(): DrawingObject {
  return {
    id: 'disjoint',
    kind: 'disjoint-channel',
    paneId: 'main',
    visible: true,
    anchors: [
      { id: 'p0', type: 'point', time: 500, price: 100 },
      { id: 'p1', type: 'point', time: 1_000, price: 140 },
      { id: 'p2', type: 'point', time: 1_000, price: 20 },
      { id: 'p3', type: 'point', time: 500, price: 60 },
    ],
    params: {},
    style: {},
  }
}

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
    handler.startDrag([createDisjointChannel()], { type: 'anchor', index: 0 }, 5, 100)

    const updated = handler.handleDragMove(pointerMove(25, 70), CONTAINER, adapter)

    // p0 移到 (25,70) 即 time 1500 / price 130：p3 时间跟随、价格反向，p1/p2 不动。
    expect(updated?.[0]?.anchors.map((anchor) => anchor.time)).toEqual([1_500, 1_000, 1_000, 1_500])
    expect(updated?.[0]?.anchors.map((anchor) => anchor.price)).toEqual([130, 140, 20, 30])
    expectMirroredChannel(updated![0]!.anchors)
  })

  it('mirrors the first line when dragging the second line endpoint', () => {
    const handler = new DragHandler()
    handler.startDrag([createDisjointChannel()], { type: 'anchor', index: 2 }, 15, 180)

    const updated = handler.handleDragMove(pointerMove(25, 60), CONTAINER, adapter)

    // p2 移到 (25,60) 即 price 140：p1 时间跟随、价格反向，p0/p3 不动。
    expect(updated?.[0]?.anchors.map((anchor) => anchor.time)).toEqual([500, 1_500, 1_500, 500])
    expect(updated?.[0]?.anchors.map((anchor) => anchor.price)).toEqual([100, 20, 140, 60])
    expectMirroredChannel(updated![0]!.anchors)
  })

  it('translates every anchor when dragging the whole drawing', () => {
    const handler = new DragHandler()
    handler.startDrag([createDisjointChannel()], { type: 'all' }, 5, 100)

    const updated = handler.handleDragMove(pointerMove(15, 70), CONTAINER, adapter)

    // 整体平移 (+10px 时间 / +30px 价格)：四个锚点保持相对位置。
    expect(updated?.[0]?.anchors.map((anchor) => anchor.time)).toEqual([1_000, 1_500, 1_500, 1_000])
    expect(updated?.[0]?.anchors.map((anchor) => anchor.price)).toEqual([130, 170, 50, 90])
    expectMirroredChannel(updated![0]!.anchors)
  })
})
