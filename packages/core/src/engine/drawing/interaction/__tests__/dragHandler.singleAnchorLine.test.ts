/**
 * 验证单锚点线的虚拟手柄拖拽：水平线只写价格，垂直线只写时间，另一根轴保持原值。
 * 坐标系沿用四 Bar 时间轴夹具：索引 i → x = i*10+5，价格 p → y = 200 - p。
 */
import { describe, expect, it } from 'vitest'

import {
  CONTAINER,
  createDrawingObject,
  createFourBarTimelineAdapter,
  pointerMove,
} from '../../__tests__/helpers/drawingTestKit'
import { DragHandler } from '../impl/DragHandler'

/** 坐标约定同夹具：x = index*10+5，y = 200 - price。 */
const adapter = createFourBarTimelineAdapter()

describe('DragHandler 单锚点线', () => {
  it('水平线手柄只改价格，不写入时间', () => {
    const drawing = createDrawingObject({
      id: 'horizontal',
      kind: 'horizontal-line',
      anchors: [{ id: 'a', type: 'horizontal', price: 100 }],
    })
    const handler = new DragHandler()
    // 手柄在右侧内边距 (260, 100)；拖到 y=80 即价格 120。
    handler.startDrag([drawing], { type: 'anchor', index: 0 }, 260, 100)

    const updated = handler.handleDragMove(pointerMove(260, 80), CONTAINER, adapter)

    expect(updated?.[0]?.anchors[0]).toMatchObject({ type: 'horizontal', price: 120 })
    expect(updated?.[0]?.anchors[0]?.time).toBeUndefined()
  })

  it('垂直线手柄只改时间，价格保持', () => {
    const drawing = createDrawingObject({
      id: 'vertical',
      kind: 'vertical-line',
      anchors: [{ id: 'a', type: 'vertical', time: 500, price: 20 }],
    })
    const handler = new DragHandler()
    // 手柄在下方内边距 (5, 200)；拖到 x=25 即 Bar 2（time 1500）。
    handler.startDrag([drawing], { type: 'anchor', index: 0 }, 5, 200)

    const updated = handler.handleDragMove(pointerMove(25, 200), CONTAINER, adapter)

    expect(updated?.[0]?.anchors[0]).toMatchObject({ type: 'vertical', time: 1_500, price: 20 })
  })
})
