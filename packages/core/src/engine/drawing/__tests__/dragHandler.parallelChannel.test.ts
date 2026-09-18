/** 验证平行通道拖拽策略：端点按角色跨线成对跟随。 */
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

/** 平行通道：0/1 为第一条线，2/3 为第二条线，两条线向量相同。 */
function createChannel(): DrawingObject {
  return {
    id: 'channel',
    kind: 'parallel-channel',
    paneId: 'main',
    visible: true,
    anchors: [
      { id: 'a', type: 'point', time: 500, price: 100 },
      { id: 'b', type: 'point', time: 1_000, price: 140 },
      { id: 'c', type: 'point', time: 500, price: 60 },
      { id: 'd', type: 'point', time: 1_000, price: 100 },
    ],
    params: {},
    style: {},
  }
}

describe('DragHandler parallel channel', () => {
  it('moves the same-role endpoint on the other line and keeps the rest fixed', () => {
    const handler = new DragHandler()
    // d 的屏幕位置为 (15, 100)，a、b、c 分别在 (5,100)、(15,60)、(5,140)。
    handler.startDrag([createChannel()], { type: 'anchor', index: 3 }, 15, 100)

    const updated = handler.handleDragMove(pointerMove(15, 120), CONTAINER, adapter)

    // 拖动 d 下移 20px：b 同位移跟随，a 与 c 固定。
    expect(updated?.[0]?.anchors.map((anchor) => anchor.price)).toEqual([100, 120, 60, 80])
  })
})
