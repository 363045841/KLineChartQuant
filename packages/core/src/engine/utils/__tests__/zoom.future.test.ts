/** 槽位缩放契约：过去、数据和未来区域的指针坐标保持一致。 */
import { describe, expect, it } from 'vitest'
import { createKLineSlotGrid, slotIndexAt, slotWorldX, zoomSlotGrid } from '../../viewport/slotGrid'
import { kGapFromKWidth } from '../zoom'

describe('无界槽位缩放', () => {
  it.each([1, 1.25, 1.5, 2, 3])('DPR=%s：正负槽位和槽内位置保持，往返无漂移', (dpr) => {
    const before = createKLineSlotGrid(17.4, kGapFromKWidth(17.4, dpr), dpr)
    const after = createKLineSlotGrid(21, kGapFromKWidth(21, dpr), dpr)
    const pointer = 201.1
    for (const index of [-1000, -1, 0, 10, 1000]) {
      for (const offset of [-0.499, -0.1, 0, 0.1, 0.499]) {
        const coordinate = index + offset
        const scroll = slotWorldX(before, coordinate) - pointer
        const next = zoomSlotGrid(before, after, scroll, pointer)
        expect((next + pointer - after.origin) / after.step).toBeCloseTo(coordinate, 10)
        expect(slotIndexAt(after, next + pointer)).toBe(index)
        expect(zoomSlotGrid(after, before, next, pointer)).toBeCloseTo(scroll, 10)
      }
    }
  })
})
