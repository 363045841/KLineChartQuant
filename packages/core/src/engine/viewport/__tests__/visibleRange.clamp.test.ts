import { describe, expect, it } from 'vitest'

import { createSignal } from '../../../foundation/reactivity/signal'
import { createViewportState } from '../../state/viewportState'
import { clampVisibleRange, getVisibleRange } from '../viewport'

describe('clampVisibleRange', () => {
  it('clamps negative start to 0 and preserves end', () => {
    expect(clampVisibleRange({ start: -1, end: 40 })).toEqual({ start: 0, end: 40 })
  })

  it('leaves non-negative start unchanged', () => {
    expect(clampVisibleRange({ start: 12, end: 50 })).toEqual({ start: 12, end: 50 })
  })
})

describe('getVisibleRange raw expansion', () => {
  it('may return start < 0 when scroll is near the left edge (expansion pad)', () => {
    // scrollLeft=0, first bars sit near plot origin → start-1 扩窗
    const raw = getVisibleRange(0, 800, 8, 2, 100, 1)
    expect(raw.start).toBeLessThan(0)
    expect(raw.end).toBeGreaterThan(0)
  })
})

describe('viewportState visibleRange SSOT', () => {
  it('exposes clamped visibleRange/visibleFrom while keeping rawVisibleRange for load triggers', async () => {
    const dataLength$ = createSignal(20)
    const module = createViewportState({
      options$: (() => ({ bottomAxisHeight: 30, kWidth: 8, kGap: 2 })) as any,
      dataLength$,
      period$: (() => 'daily') as any,
      zoomLevel$: (() => 3) as any,
      sessionSlots$: (() => 240) as any,
    })

    // resize 后 scrollLeftLogical≈0（右对齐短序列或左缘），raw start 常为 -1
    module.actions.resize(800, 400, 1)
    module.actions.scrollTo(module.readonly.leftLoadBufferWidth.peek())

    const raw = module.readonly.rawVisibleRange()
    const clamped = module.readonly.visibleRange()
    const vs = module.readonly.viewportState()

    expect(raw.start).toBeLessThan(0)
    expect(clamped.start).toBe(0)
    expect(clamped.end).toBe(raw.end)
    expect(vs.visibleFrom).toBe(0)
    expect(vs.visibleTo).toBe(clamped.end)
  })

  it('timeshare visible range covers full data regardless of kWidth rounding (slot grid)', () => {
    const dataLength$ = createSignal(240)
    const module = createViewportState({
      options$: (() => ({ bottomAxisHeight: 30, kWidth: 3, kGap: 1 })) as any,
      dataLength$,
      period$: (() => 'timeshare') as any,
      zoomLevel$: (() => 3) as any,
      sessionSlots$: (() => 240) as any,
    })
    // 旧实现（kWidth/kGap 取整网格）在 W=900, kWidth=3, kGap=1 时 end 只有 226
    module.actions.resize(900, 400, 1)
    const raw = module.readonly.rawVisibleRange()
    const clamped = module.readonly.visibleRange()
    expect(raw.start).toBe(-1)
    expect(clamped.start).toBe(0)
    expect(clamped.end).toBe(240)
    expect(raw.end).toBe(240)
  })
})
