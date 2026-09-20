/** 验证平行通道拖拽策略：端点按角色跨线成对跟随。 */
import { describe, expect, it } from 'vitest'

import { DragHandler } from '../DragHandler'
import {
  CONTAINER,
  createFourBarTimelineAdapter,
  createParallelChannelDrawing,
  pointerMove,
} from './helpers/drawingTestKit'

/** 坐标约定：索引 i → x = i*10+5，价格 → y = 200 - price。 */
const adapter = createFourBarTimelineAdapter()

describe('DragHandler parallel channel', () => {
  it('moves the same-role endpoint on the other line and keeps the rest fixed', () => {
    const handler = new DragHandler()
    // d 的屏幕位置为 (15, 100)，a、b、c 分别在 (5,100)、(15,60)、(5,140)。
    handler.startDrag([createParallelChannelDrawing()], { type: 'anchor', index: 3 }, 15, 100)

    const updated = handler.handleDragMove(pointerMove(15, 120), CONTAINER, adapter)

    // 拖动 d 下移 20px：b 同位移跟随，a 与 c 固定。
    expect(updated?.[0]?.anchors.map((anchor) => anchor.price)).toEqual([100, 120, 60, 80])
  })
})
