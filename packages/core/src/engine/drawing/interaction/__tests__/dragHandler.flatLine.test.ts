/** 验证平滑顶底（flat-line）拖拽策略：斜线端点自由、水平线只跟时间，水平线端点另一头只跟价格。 */
import { describe, expect, it } from 'vitest'

import {
  CONTAINER,
  createFlatLineDrawing,
  createFourBarTimelineAdapter,
  pointerMove,
} from '../../__tests__/helpers/drawingTestKit'
import { DragHandler } from '../impl/DragHandler'

/** 坐标约定：索引 i → x = i*10+5，价格 → y = 200 - price。 */
const adapter = createFourBarTimelineAdapter()

describe('DragHandler flat line', () => {
  it('lets the flat endpoint follow the slanted endpoint in time only', () => {
    const handler = new DragHandler()
    handler.startDrag([createFlatLineDrawing()], { type: 'anchor', index: 0 }, 5, 100)

    const updated = handler.handleDragMove(pointerMove(12, 80), CONTAINER, adapter)

    // a 移到 (12,80)：h1 只横向跟随，价格保持 60。
    expect(updated?.[0]?.anchors.map((anchor) => anchor.price)).toEqual([120, 140, 60, 60])
    expect(updated?.[0]?.anchors[2]).toMatchObject({ time: 1_000, price: 60 })
  })

  it('keeps the flat line horizontal and drags the slanted endpoint in time', () => {
    const handler = new DragHandler()
    handler.startDrag([createFlatLineDrawing()], { type: 'anchor', index: 2 }, 5, 140)

    const updated = handler.handleDragMove(pointerMove(12, 110), CONTAINER, adapter)

    // h1 上移到价格 90 并右移到 Bar 1：斜线同侧端点 a 只跟时间，h2 只跟价格。
    expect(updated?.[0]?.anchors.map((anchor) => anchor.price)).toEqual([100, 140, 90, 90])
    expect(updated?.[0]?.anchors[0]).toMatchObject({ time: 1_000, price: 100 })
    expect(updated?.[0]?.anchors[3]).toMatchObject({ time: 1_000, price: 90 })
  })

  it('translates every anchor when dragging the whole drawing', () => {
    const handler = new DragHandler()
    handler.startDrag([createFlatLineDrawing()], { type: 'all' }, 25, 100)

    const updated = handler.handleDragMove(pointerMove(35, 90), CONTAINER, adapter)

    // 整体平移 (+10px 时间 / +10px 价格)：四个锚点保持相对位置。
    expect(updated?.[0]?.anchors.map((anchor) => anchor.price)).toEqual([110, 150, 70, 70])
    expect(updated?.[0]?.anchors[0]).toMatchObject({ time: 1_000 })
    expect(updated?.[0]?.anchors[1]).toMatchObject({ time: 1_500 })
    expect(updated?.[0]?.anchors[2]).toMatchObject({ time: 1_000 })
    expect(updated?.[0]?.anchors[3]).toMatchObject({ time: 1_500 })
  })
})
