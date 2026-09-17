/** DragHandler 磁吸单测：锚点拖拽随指针吸附 OHLC，整线拖拽不受磁吸影响。 */
import { describe, expect, it } from 'vitest'

import { DragHandler } from '../DragHandler'
import {
  CONTAINER,
  createDrawingObject,
  createMagnetAdapter,
  pointerMove,
} from './helpers/drawingTestKit'

/** 覆盖拖拽路径坐标换算的最小 adapter（与 interaction.magnet 测试同一坐标系约定）。 */
const { adapter } = createMagnetAdapter()

/** 单锚点趋势线：锚点屏幕位置 (15, 90)（Bar 1 中心、价格 110）。 */
const createAnchorDragDrawing = () =>
  createDrawingObject({
    id: 'd1',
    kind: 'trend-line',
    anchors: [{ id: 'a0', type: 'point', time: 1000, price: 110 }],
  })

describe('DragHandler magnet', () => {
  it('锚点拖拽：strong 磁吸把被拖锚点收敛到 OHLC 与 Bar 中心', () => {
    const handler = new DragHandler()
    handler.startDrag([createAnchorDragDrawing()], { type: 'anchor', index: 0 }, 15, 90)

    // 指针 (12, 83)：距 high(y=80) 3px，strong 半径内 → 价格收敛 120；X 吸 Bar 中心 15（时间 1000）。
    const updated = handler.handleDragMove(pointerMove(12, 83), CONTAINER, adapter, {
      magnet: { mode: 'strong' },
    })
    expect(updated).toHaveLength(1)
    expect(updated![0]!.anchors[0]).toMatchObject({ time: 1000, price: 120 })
  })

  it('锚点拖拽：不传磁吸时锚点保持原始指针落点', () => {
    const handler = new DragHandler()
    handler.startDrag([createAnchorDragDrawing()], { type: 'anchor', index: 0 }, 15, 90)

    const updated = handler.handleDragMove(pointerMove(12, 83), CONTAINER, adapter)
    expect(updated![0]!.anchors[0]).toMatchObject({ time: 1000, price: 117 })
  })

  it('整线拖拽不受磁吸影响（位移增量语义）', () => {
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
