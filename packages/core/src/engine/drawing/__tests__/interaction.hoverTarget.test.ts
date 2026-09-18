/** 验证宿主悬停查询：锚点 → 十字光标，线段中点手柄 → 上下移动光标，其余不改变光标。 */
import { describe, expect, it } from 'vitest'

import type { DrawingObject } from '../../../foundation/plugin'
import { DrawingInteractionController } from '../interaction'
import {
  CONTAINER,
  createDrawingObject,
  createSelectionAdapter,
  pointerMove,
} from './helpers/drawingTestKit'

/**
 * 平滑顶底夹具（坐标约定：索引 i → x = i*10+5，价格 → y = 200 - price）。
 * 屏幕位置：斜线 (5,100)-(15,60)，水平线 (5,140)-(15,140)。
 */
function createFlatLine(): DrawingObject {
  return createDrawingObject({
    id: 'flat',
    kind: 'flat-line',
    anchors: [
      { id: 'a', type: 'point', time: 500, price: 100 },
      { id: 'b', type: 'point', time: 1_000, price: 140 },
      { id: 'h1', type: 'point', time: 500, price: 60 },
      { id: 'h2', type: 'point', time: 1_000, price: 60 },
    ],
  })
}

describe('DrawingInteractionController hovered target', () => {
  it('reports the anchor under the pointer', () => {
    const { adapter } = createSelectionAdapter([createFlatLine()])
    const controller = new DrawingInteractionController(adapter)

    // 锚点 a 的屏幕位置为 (5,100)，锚点不依赖选中态。
    expect(controller.getHoveredTarget(pointerMove(5, 100), CONTAINER)).toBe('anchor')
    // 线身中点既不是锚点也不是手柄：不改变光标。
    expect(controller.getHoveredTarget(pointerMove(10, 90), CONTAINER)).toBeNull()
  })

  it('reports the vertical handle of a selected line', () => {
    const { adapter } = createSelectionAdapter([createFlatLine()])
    const controller = new DrawingInteractionController(adapter)

    // 斜线中点 (10,80)：未选中时按线身处理。
    expect(controller.getHoveredTarget(pointerMove(10, 80), CONTAINER)).toBeNull()
    adapter.setSelectedDrawingIds(['flat'])
    expect(controller.getHoveredTarget(pointerMove(10, 80), CONTAINER)).toBe('vertical-handle')
  })
})
