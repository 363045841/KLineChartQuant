/**
 * 验证绘图悬停命中：目标语义与光标在命中处一起给出，宿主只透传。
 * 坐标系沿用选择用例夹具：索引 i → x = i*10+5，价格 p → y = 200 - p；绘图区宽 100、Pane 高 240。
 */
import { describe, expect, it } from 'vitest'

import {
  CONTAINER,
  createDrawingObject,
  createSelectionAdapter,
} from '../../__tests__/helpers/drawingTestKit'
import type { DrawingObject } from '../../types'
import { DrawingInteractionController } from '../impl/interaction'

/** 悬停命中；selected 控制选中态，靠边手柄只在该态参与命中。 */
function hoverHit(drawing: DrawingObject, x: number, y: number, selected = false) {
  const { adapter, setSelectedDrawingIds } = createSelectionAdapter([drawing], {
    paneHeight: 240,
    plotHeight: 240,
  })
  setSelectedDrawingIds(selected ? [drawing.id] : [])
  return new DrawingInteractionController(adapter).getHoveredHit(
    { clientX: x, clientY: y },
    CONTAINER,
  )
}

describe('DrawingInteractionController 悬停命中', () => {
  /** 水平线：价格 100 → y=100，手柄在右侧内边距 60（绘图区宽 100）。 */
  const horizontal = createDrawingObject({
    id: 'horizontal',
    kind: 'horizontal-line',
    anchors: [{ id: 'a', type: 'horizontal', price: 100 }],
  })

  /** 垂直线：时间 500 → x=5，手柄在下方内边距 200（Pane 高 240）。 */
  const vertical = createDrawingObject({
    id: 'vertical',
    kind: 'vertical-line',
    anchors: [{ id: 'a', type: 'vertical', time: 500, price: 20 }],
  })

  it('选中水平线的右侧手柄 → 价格轴锚点与 ns-resize', () => {
    const hit = hoverHit(horizontal, 60, 100, true)
    expect(hit?.target).toEqual({ type: 'anchor', index: 0 })
    expect(hit?.cursor).toBe('ns-resize')
  })

  it('选中垂直线的下方手柄 → 时间轴锚点与 ew-resize', () => {
    const hit = hoverHit(vertical, 5, 200, true)
    expect(hit?.target).toEqual({ type: 'anchor', index: 0 })
    expect(hit?.cursor).toBe('ew-resize')
  })

  it('未选中时同一位置按线身处理', () => {
    const hit = hoverHit(horizontal, 60, 100)
    expect(hit?.target).toEqual({ type: 'all' })
    expect(hit?.cursor).toBe('move')
  })

  it('点类锚点保持默认箭头', () => {
    const trend = createDrawingObject({
      id: 'trend',
      kind: 'trend-line',
      anchors: [
        { id: 'a', type: 'point', time: 500, price: 100 },
        { id: 'b', type: 'point', time: 1_000, price: 140 },
      ],
    })
    const hit = hoverHit(trend, 5, 100)
    expect(hit?.target).toEqual({ type: 'anchor', index: 0 })
    expect(hit?.cursor).toBe('default')
  })
})
