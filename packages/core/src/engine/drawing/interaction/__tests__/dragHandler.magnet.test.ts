/** DragHandler 磁吸单测：锚点拖拽随指针吸附 OHLC，整线拖拽不受磁吸影响。 */
import { describe, expect, it } from 'vitest'

import {
  CONTAINER,
  createAnchorDragDrawing,
  createMagnetAdapter,
  pointerMove,
} from '../../__tests__/helpers/drawingTestKit'
import { DragHandler } from '../impl/DragHandler'

describe('DragHandler magnet', () => {
  it('锚点拖拽：strong 磁吸把被拖锚点收敛到 OHLC 与 Bar 中心', () => {
    const { adapter } = createMagnetAdapter()
    const handler = new DragHandler()
    handler.startDrag([createAnchorDragDrawing()], { type: 'anchor', index: 0 }, 15, 90)

    // 指针 (12, 83)：strong 吸最近的 high(y=80) → 价格收敛 120；X 吸 Bar 中心 15（时间 1000）。
    const updated = handler.handleDragMove(pointerMove(12, 83), CONTAINER, adapter, {
      magnet: { mode: 'strong' },
    })
    expect(updated).toHaveLength(1)
    expect(updated![0]!.anchors[0]).toMatchObject({ time: 1000, price: 120 })
  })

  it('锚点拖拽：不传磁吸时锚点保持原始指针落点', () => {
    const { adapter } = createMagnetAdapter()
    const handler = new DragHandler()
    handler.startDrag([createAnchorDragDrawing()], { type: 'anchor', index: 0 }, 15, 90)

    const updated = handler.handleDragMove(pointerMove(12, 83), CONTAINER, adapter)
    expect(updated![0]!.anchors[0]).toMatchObject({ time: 1000, price: 117 })
  })

  it('整线拖拽不受磁吸影响（位移增量语义）', () => {
    const { adapter } = createMagnetAdapter()
    const handler = new DragHandler()
    handler.startDrag([createAnchorDragDrawing()], { type: 'all' }, 15, 90)

    // 指针 (12, 83) 若被磁吸改写为 (15, 80)，锚点会收敛到价格 120；
    // 增量语义下应随位移 (-3, -7) 到 (12, 83)，价格 117。
    const updated = handler.handleDragMove(pointerMove(12, 83), CONTAINER, adapter, {
      magnet: { mode: 'strong' },
    })
    expect(updated![0]!.anchors[0]).toMatchObject({ time: 1000, price: 117 })
  })
})
