/** 验证回归通道端点和整体拖拽不会进入最后一根 K 线右侧的未来槽位。 */
import { describe, expect, it } from 'vitest'

import {
  CONTAINER,
  createDrawingObject,
  createFourBarTimelineAdapter,
  pointerMove,
} from '../../__tests__/helpers/drawingTestKit'
import type { PersistedDrawingAnchor } from '../../types'
import { DragHandler } from '../impl/DragHandler'
import { DrawingTool } from '../types'

const adapter = createFourBarTimelineAdapter()

/** 构造正向或反向端点的回归通道，覆盖较新端点的两种存储顺序。 */
function createRegressionDrawing(reversed: boolean) {
  const anchors: PersistedDrawingAnchor[] = [
    { id: 'older', type: 'point', time: 500, price: 100 },
    { id: 'newer', type: 'point', time: 1_500, price: 140 },
  ]
  return createDrawingObject({
    id: 'regression',
    kind: DrawingTool.RegressionChannel,
    anchors: reversed ? anchors.reverse() : anchors,
  })
}

describe('DragHandler regression channel data boundary', () => {
  it.each([false, true])('clamps the newer endpoint with reversed=%s', (reversed) => {
    const drawing = createRegressionDrawing(reversed)
    const index = reversed ? 0 : 1
    const handler = new DragHandler()
    handler.startDrag([drawing], { type: 'anchor', index }, 25, 60)

    const updated = handler.handleDragMove(pointerMove(95, 80), CONTAINER, adapter)?.[0]
    expect(updated?.anchors[index]).toMatchObject({ time: 2_000, price: 120 })
    expect(updated?.anchors[index]?.futureOffset).toBeUndefined()
    expect(updated?.anchors[1 - index]).toEqual(drawing.anchors[1 - index])

    // 越界后回拖仍基于起始快照，端点可以正常回到已有 K 线。
    const returned = handler.handleDragMove(pointerMove(15, 80), CONTAINER, adapter)?.[0]
    expect(returned?.anchors[index]).toMatchObject({ time: 1_000 })
  })

  it.each([false, true])('preserves the interval on whole drag with reversed=%s', (reversed) => {
    const drawing = createRegressionDrawing(reversed)
    const handler = new DragHandler()
    handler.startDrag([drawing], { type: 'all' }, 15, 80)

    const updated = handler.handleDragMove(pointerMove(95, 100), CONTAINER, adapter)?.[0]
    expect(updated?.anchors.map((anchor) => anchor.time)).toEqual(
      reversed ? [2_000, 1_000] : [1_000, 2_000],
    )
    expect(updated?.anchors.every((anchor) => anchor.futureOffset === undefined)).toBe(true)
    expect(updated?.anchors.map((anchor) => anchor.price)).toEqual(reversed ? [120, 80] : [80, 120])
  })

  it('keeps ordinary trend line endpoints available in future slots', () => {
    const drawing = { ...createRegressionDrawing(false), kind: DrawingTool.TrendLine }
    const handler = new DragHandler()
    handler.startDrag([drawing], { type: 'anchor', index: 1 }, 25, 60)

    const updated = handler.handleDragMove(pointerMove(95, 80), CONTAINER, adapter)?.[0]
    expect(updated?.anchors[1]).toMatchObject({ time: 2_000, futureOffset: 6 })
  })
})
