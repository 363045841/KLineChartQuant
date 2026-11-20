/** 逻辑索引到屏幕 X 的投影：封口帧中心步长与未来槽位外推。 */
import { describe, expect, it } from 'vitest'

import { logicalIndexToScreenX } from '../logicalIndexToScreenX'

describe('logicalIndexToScreenX', () => {
  it.each([
    {
      name: 'future slot 复用封口帧中心步长',
      input: { index: 8, visibleRange: { start: 5, end: 7 }, centers: [20, 35], scrollLeft: 10, dpr: 1, fallbackStep: 12 },
      expected: 55,
    },
    {
      name: '单中心点时使用 fallback step',
      input: { index: 4, visibleRange: { start: 1, end: 2 }, centers: [20], scrollLeft: 5, dpr: 1, fallbackStep: 12 },
      expected: 51,
    },
    {
      name: '未来槽位使用尾部帧步长',
      input: { index: 3, visibleRange: { start: 0, end: 3 }, centers: [8, 37, 137], scrollLeft: 0, dpr: 1, fallbackStep: 12 },
      expected: 237,
    },
    {
      name: '封口中心使用同一物理像素投影',
      input: { index: 1, visibleRange: { start: 1, end: 2 }, centers: [20.8], scrollLeft: 0.6, dpr: 1.25, fallbackStep: 12 },
      expected: 20,
    },
  ])('$name', ({ input, expected }) => {
    expect(logicalIndexToScreenX(input)).toBe(expected)
  })
})
