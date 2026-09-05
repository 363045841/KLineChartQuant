/** 验证渲染、命中和拖拽共用的逻辑索引屏幕投影。 */
import { describe, expect, it } from 'vitest'

import { logicalIndexToScreenX } from '../logicalIndexToScreenX'

describe('logicalIndexToScreenX', () => {
  it('projects future slots by extrapolating the sealed frame center step', () => {
    expect(
      logicalIndexToScreenX({
        index: 8,
        visibleRange: { start: 5, end: 7 },
        centers: [20, 35],
        scrollLeft: 10,
        fallbackStep: 12,
      }),
    ).toBe(55)
  })

  it('uses the supplied step when the frame has one center point', () => {
    expect(
      logicalIndexToScreenX({
        index: 4,
        visibleRange: { start: 1, end: 2 },
        centers: [20],
        scrollLeft: 5,
        fallbackStep: 12,
      }),
    ).toBe(51)
  })

  it('uses the trailing frame step for future slots', () => {
    expect(
      logicalIndexToScreenX({
        index: 3,
        visibleRange: { start: 0, end: 3 },
        centers: [8, 37, 137],
        scrollLeft: 0,
        fallbackStep: 12,
      }),
    ).toBe(237)
  })
})
