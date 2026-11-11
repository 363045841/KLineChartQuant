/** 用真实横轴策略验证选框与绘制实体共享坐标，包括连续缩放和历史补齐。 */
import { describe, expect, it } from 'vitest'
import { SCALE_X_STRATEGIES } from '../../../core/src/engine/scale/impl/scale_X/scaleXStrategies.js'
import type { ScaleXInput } from '../../../core/src/engine/scale/impl/scale_X/types.js'
import { calcRangeOverlayPixel } from './calcRangeOverlayPixel.js'

const data = Array.from({ length: 200 }, (_, index) => ({
  timestamp: index * 60_000,
  open: 100,
  high: 101,
  low: 99,
  close: 100,
}))
const selection = { startTimestamp: 60_000 * 40, endTimestamp: 60_000 * 60, isDragging: false }

/** 直接运行核心投影，测试不维护替代网格或坐标实现。 */
function projectFrame(kWidth: number, dpr: number, items = data) {
  const input: ScaleXInput = {
    view: 'kline', width: 800, dpr, kWidth, kGapRatio: 0.25,
    sessionSlotWidth: null, data: items, dataLength: items.length,
    marketSession: null, timeShareRange: null, scroll: 100.3,
  }
  const viewSnapshot = SCALE_X_STRATEGIES.kline.project(input)
  return {
    viewSnapshot,
    viewport: {
      viewWidth: 800, viewHeight: 500, plotWidth: 800, plotHeight: 476,
      scrollLeft: viewSnapshot.scroll, dpr,
    },
    data: items,
  }
}

describe('range selection frame projection', () => {
  it.each([1, 1.5, 2])('aligns with the painted candle boundaries at DPR %s', (dpr) => {
    const frame = projectFrame(8.17, dpr)
    const pixel = calcRangeOverlayPixel(selection, frame)!
    const view = frame.viewSnapshot
    const startOffset = 40 - view.range.start
    const endOffset = 60 - view.range.start
    expect(pixel.left).toBeCloseTo(view.domOffset + view.positions[startOffset]!, 10)
    expect(pixel.left + pixel.width).toBeCloseTo(
      view.domOffset + view.positions[endOffset]! + view.kWidthPx / dpr, 10,
    )
  })

  it('updates continuous zoom even while the visible index range is unchanged', () => {
    const before = projectFrame(8.17, 2)
    const after = projectFrame(8.171, 2)
    expect(after.viewSnapshot.range).toEqual(before.viewSnapshot.range)
    expect(calcRangeOverlayPixel(selection, after)).not.toEqual(calcRangeOverlayPixel(selection, before))
  })

  it('resolves timestamps against the data belonging to each frame after prepend', () => {
    const current = projectFrame(8.17, 2)
    const prepended = projectFrame(8.17, 2, [
      { timestamp: -60_000, open: 100, high: 101, low: 99, close: 100 }, ...data,
    ])
    const pixel = calcRangeOverlayPixel(selection, prepended)!
    const view = prepended.viewSnapshot
    expect(pixel.left).toBeCloseTo(view.domOffset + view.positions[41 - view.range.start]!, 10)
    expect(calcRangeOverlayPixel(selection, current)).not.toEqual(pixel)
  })

  it('supports reverse selection and clears incomplete selections', () => {
    const frame = projectFrame(8.17, 2)
    expect(calcRangeOverlayPixel({ ...selection, startTimestamp: selection.endTimestamp,
      endTimestamp: selection.startTimestamp }, frame)).toEqual(calcRangeOverlayPixel(selection, frame))
    expect(calcRangeOverlayPixel({ ...selection, endTimestamp: null }, frame)).toBeNull()
  })
})
