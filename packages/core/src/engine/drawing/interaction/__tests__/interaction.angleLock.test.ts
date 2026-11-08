/**
 * Shift 锁角集成测试：绘制落点与锚点拖拽两条路径都按 45° 档位收敛。
 * 锁角与磁吸的互斥由磁吸用例覆盖（同一控制器的 Shift / 非 Shift 切换）。
 */
import { describe, expect, it, vi } from 'vitest'

import {
  CONTAINER,
  createAngleLockAdapter,
  createDrawingObject,
  pointerDown,
  pointerMove,
} from '../../__tests__/helpers/drawingTestKit'
import type { PersistedDrawingAnchor } from '../../types'
import { DrawingInteractionController } from '../impl/interaction'
import { DrawingTool } from '../types'

/** 锁定后的价格：距离不变，价格差等于目标角度的正弦乘以位移长度（该 adapter 中 y 即价格）。 */
function lockedPrice(originY: number, dx: number, dy: number, angle: number): number {
  return originY + Math.sin(angle) * Math.hypot(dx, dy)
}

/** 当前趋势线预览的第二个锚点价格。 */
function previewSecondPrice(controller: DrawingInteractionController): number | undefined {
  return controller.getPaintOverlay()[0]?.anchors[1]?.price
}

describe('DrawingInteractionController angle lock', () => {
  it.each([
    { name: '0°（水平）', origin: { x: 20, y: 30 }, pointer: { x: 80, y: 36 }, angle: 0 },
    {
      name: '-45°（右上）',
      origin: { x: 20, y: 80 },
      pointer: { x: 80, y: 50 },
      angle: -Math.PI / 4,
    },
    {
      name: '45°（右下）',
      origin: { x: 20, y: 20 },
      pointer: { x: 80, y: 50 },
      angle: Math.PI / 4,
    },
  ])('绘制时把 $name 附近的落点锁定到该档位', ({ origin, pointer, angle }) => {
    const controller = new DrawingInteractionController(
      createAngleLockAdapter(DrawingTool.TrendLine),
    )
    controller.onPointerDown(pointerDown(origin.x, origin.y), CONTAINER)

    controller.onPointerMove(pointerMove(pointer.x, pointer.y, { shiftKey: true }), CONTAINER)

    expect(previewSecondPrice(controller)).toBeCloseTo(
      lockedPrice(origin.y, pointer.x - origin.x, pointer.y - origin.y, angle),
      10,
    )
  })

  it('拖动已有趋势线的端点时锁角，参考点是另一端', () => {
    const commitDrawingDrag = vi.fn(
      (_id: string, _anchors: ReadonlyArray<PersistedDrawingAnchor>) => null,
    )
    const drawing = createDrawingObject({
      id: 'd1',
      kind: 'trend-line',
      anchors: [
        { id: 'a0', type: 'point', time: 5, price: 20 },
        { id: 'a1', type: 'point', time: 15, price: 80 },
      ],
    })
    const controller = new DrawingInteractionController(
      createAngleLockAdapter(DrawingTool.Cursor, { commitDrawingDrag }, [drawing]),
    )

    // 按住末端锚点 (15, 80) 起拖；Shift 拖到 (60, 70)，以另一端 (5, 20) 为参考锁定到 45°。
    controller.onPointerDown(pointerDown(15, 80), CONTAINER)
    controller.onPointerMove(pointerMove(60, 70, { shiftKey: true }), CONTAINER)
    controller.onPointerUp(pointerMove(60, 70, { shiftKey: true }), CONTAINER)

    const committed = commitDrawingDrag.mock.calls[0]!
    expect(committed[0]).toBe('d1')
    expect(committed[1][0]).toMatchObject({ price: 20 })
    expect(committed[1][1]!.price).toBeCloseTo(lockedPrice(20, 55, 50, Math.PI / 4), 10)
  })
})
