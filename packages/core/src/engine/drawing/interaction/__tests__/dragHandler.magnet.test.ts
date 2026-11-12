/**
 * DragHandler 磁吸单测：锚点拖拽按候选收敛，整线拖拽保持位移语义，
 * 并且本次拖拽的图元不进入候选（否则会吸到自己）。
 */
import { describe, expect, it } from 'vitest'

import {
  CONTAINER,
  createAnchorDragDrawing,
  createMagnetAdapter,
  createMagnetConfig,
  pointerMove,
} from '../../__tests__/helpers/drawingTestKit'
import { DragHandler } from '../impl/DragHandler'

describe('DragHandler magnet', () => {
  it('锚点拖拽：strong 把落点收敛到 OHLC 与 Bar 中心', () => {
    const { adapter } = createMagnetAdapter()
    const handler = new DragHandler()
    handler.startDrag([createAnchorDragDrawing()], { type: 'anchor', index: 0 }, 15, 90)

    const updated = handler.handleDragMove(pointerMove(12, 83), CONTAINER, adapter, {
      magnet: createMagnetConfig('strong'),
    })
    expect(updated![0]!.anchors[0]).toMatchObject({ time: 1000, price: 120 })
  })

  it('锚点拖拽：不传磁吸时保持原始指针落点', () => {
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

    const updated = handler.handleDragMove(pointerMove(12, 83), CONTAINER, adapter, {
      magnet: createMagnetConfig('strong'),
    })
    // 整体平移保留连续位移，不能把非目标锚点重新吸附到其他周期的槽位。
    expect(updated![0]!.anchors[0]).toMatchObject({ time: 850, price: 117 })
  })

  it('拖拽中的图元被排除在候选之外', () => {
    const { adapter } = createMagnetAdapter()
    const drawing = createAnchorDragDrawing()
    const handler = new DragHandler()
    handler.startDrag([drawing], { type: 'anchor', index: 0 }, 15, 90)

    const lines = [{ drawingId: drawing.id, a: { x: 0, y: 60 }, b: { x: 100, y: 60 } }]
    const updated = handler.handleDragMove(pointerMove(12, 62), CONTAINER, adapter, {
      magnet: createMagnetConfig('weak', { lines }),
    })
    // 自身线被排除后没有命中候选：价格回到指针落点，而不是 140。
    expect(updated![0]!.anchors[0]!.price).toBe(138)
    expect(handler.getSnapIndicator()).toBeNull()
  })
})
