/**
 * 对数轴下的拖拽跟随：跟随位移在屏幕空间完成，位移系数 -1 等价于对数空间取反。
 *
 * 坐标约定：x 沿用四 Bar 时间轴（索引 i → i*10+5），Y 取对数轴 y = 300 - 40*ln(price)。
 * 价格翻倍固定对应 Y 减少 40*ln2，因此「屏幕反向同距」等于「对数空间取反」。
 */
import { describe, expect, it } from 'vitest'

import { ScaleType } from '@/foundation/types/scaleType'
import {
  CONTAINER,
  createDisjointChannelDrawing,
  createFourBarTimelineAdapter,
  pointerMove,
} from '../../__tests__/helpers/drawingTestKit'
import { DragHandler } from '../impl/DragHandler'

const LOG_SCALE = 40
const LOG_ORIGIN = 300

/** 对数轴价格 → Pane 局部 Y。 */
function logPriceToY(price: number): number {
  return LOG_ORIGIN - LOG_SCALE * Math.log(price)
}

/** 对数轴 Pane 局部 Y → 价格。 */
function logYToPrice(y: number): number {
  return Math.exp((LOG_ORIGIN - y) / LOG_SCALE)
}

/** 对数轴 adapter：价格轴换成对数映射，其余沿用四 Bar 时间轴约定。 */
const adapter = createFourBarTimelineAdapter({
  priceToY: (_paneId: string, price: number) => logPriceToY(price),
  yToPrice: (_paneId: string, y: number) => logYToPrice(y),
  getPaneInfo: () => ({ paneId: 'main', top: 0, height: 240, scaleType: ScaleType.Log }),
  getPaneAtY: () => ({ paneId: 'main', top: 0, height: 240, scaleType: ScaleType.Log }),
})

describe('DragHandler on a logarithmic axis', () => {
  it('把被拖锚点翻倍时，镜像伙伴按等比减半', () => {
    const handler = new DragHandler()
    // 锚点 0 的价格 100 落在 y = logPriceToY(100)，锚点 3 的价格 60 落在 y = logPriceToY(60)。
    const startY = logPriceToY(100)
    handler.startDrag([createDisjointChannelDrawing()], { type: 'anchor', index: 0 }, 5, startY)

    // 向上拖 40*ln2：锚点 0 的价格翻倍到 200，镜像伙伴 3 应减半到 30。
    const updated = handler.handleDragMove(
      pointerMove(5, startY - LOG_SCALE * Math.log(2)),
      CONTAINER,
      adapter,
    )

    expect(updated?.[0]?.anchors[0]?.price).toBeCloseTo(200, 6)
    expect(updated?.[0]?.anchors[3]?.price).toBeCloseTo(30, 6)
    // 另外两个锚点保持不动。
    expect(updated?.[0]?.anchors[1]?.price).toBeCloseTo(140, 6)
    expect(updated?.[0]?.anchors[2]?.price).toBeCloseTo(20, 6)
  })
})
