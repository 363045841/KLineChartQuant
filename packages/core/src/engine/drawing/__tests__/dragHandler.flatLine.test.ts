/** 验证平滑顶底（flat-line）拖拽策略：斜线端点自由、水平线只跟时间，水平线端点另一头只跟价格。 */
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

/** 平滑顶底：0/1 为斜线两端，2/3 为水平线两端，屏幕位置分别为 (5,100)、(15,60)、(5,140)、(15,140)。 */
function createFlatLine(): DrawingObject {
  return {
    id: 'flat',
    kind: 'flat-line',
    paneId: 'main',
    visible: true,
    anchors: [
      { id: 'a', type: 'point', time: 500, price: 100 },
      { id: 'b', type: 'point', time: 1_000, price: 140 },
      { id: 'h1', type: 'point', time: 500, price: 60 },
      { id: 'h2', type: 'point', time: 1_000, price: 60 },
    ],
    params: {},
    style: {},
  }
}

describe('DragHandler flat line', () => {
  it('lets the flat endpoint follow the slanted endpoint in time only', () => {
    const handler = new DragHandler()
    handler.startDrag([createFlatLine()], { type: 'anchor', index: 0 }, 5, 100)

    const updated = handler.handleDragMove(pointerMove(12, 80), CONTAINER, adapter)

    // a 移到 (12,80)：h1 只横向跟随，价格保持 60。
    expect(updated?.[0]?.anchors.map((anchor) => anchor.price)).toEqual([120, 140, 60, 60])
    expect(updated?.[0]?.anchors[2]).toMatchObject({ time: 1_000, price: 60 })
  })

  it('keeps the flat line horizontal and drags the slanted endpoint in time', () => {
    const handler = new DragHandler()
    handler.startDrag([createFlatLine()], { type: 'anchor', index: 2 }, 5, 140)

    const updated = handler.handleDragMove(pointerMove(12, 110), CONTAINER, adapter)

    // h1 上移到价格 90 并右移到 Bar 1：斜线同侧端点 a 只跟时间，h2 只跟价格。
    expect(updated?.[0]?.anchors.map((anchor) => anchor.price)).toEqual([100, 140, 90, 90])
    expect(updated?.[0]?.anchors[0]).toMatchObject({ time: 1_000, price: 100 })
    expect(updated?.[0]?.anchors[3]).toMatchObject({ time: 1_000, price: 90 })
  })

  it('moves both flat endpoints freely when dragging the flat edge', () => {
    const handler = new DragHandler()
    handler.startDrag([createFlatLine()], { type: 'edge', anchors: [2, 3] }, 25, 100)

    const updated = handler.handleDragMove(pointerMove(35, 90), CONTAINER, adapter)

    // 水平线整体平移：斜线两端只跟时间。
    expect(updated?.[0]?.anchors.map((anchor) => anchor.price)).toEqual([100, 140, 70, 70])
    expect(updated?.[0]?.anchors[0]).toMatchObject({ time: 1_000 })
    expect(updated?.[0]?.anchors[1]).toMatchObject({ time: 1_500 })
    expect(updated?.[0]?.anchors[2]).toMatchObject({ time: 1_000 })
    expect(updated?.[0]?.anchors[3]).toMatchObject({ time: 1_500 })
  })

  it('carries the flat endpoints in time when dragging the slanted edge', () => {
    const handler = new DragHandler()
    handler.startDrag([createFlatLine()], { type: 'edge', anchors: [0, 1] }, 25, 100)

    const updated = handler.handleDragMove(pointerMove(35, 90), CONTAINER, adapter)

    // 斜线整体平移 (-10px 价格)：水平线两端只跟时间，价格不变。
    expect(updated?.[0]?.anchors.map((anchor) => anchor.price)).toEqual([110, 150, 60, 60])
    expect(updated?.[0]?.anchors[2]).toMatchObject({ time: 1_000 })
    expect(updated?.[0]?.anchors[3]).toMatchObject({ time: 1_500 })
  })
})
