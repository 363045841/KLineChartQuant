/** 可见槽位范围与 raw 窗口的边界回归。 */
import { describe, expect, it } from 'vitest'

import { createViewportFixture } from './helpers/viewportFixture'

describe('viewportState visibleRange SSOT', () => {
  it('左加载缓冲只影响 raw 窗口，可见范围从 0 开始', () => {
    const module = createViewportFixture({ dataLength: 20 })
    module.actions.scrollTo(module.readonly.leftLoadBufferWidth())
    const raw = module.readonly.rawVisibleRange()
    expect(raw.start).toBeLessThan(0)
    expect(module.readonly.visibleRange()).toEqual({ start: 0, end: raw.end })
    expect(module.readonly.viewportState().visibleFrom).toBe(0)
  })

  it('右侧越界被夹到末尾，同时保留末尾缓存 K 线', () => {
    const module = createViewportFixture({ dataLength: 10, width: 400 })
    module.actions.scrollToLogical(1000)
    const range = module.readonly.rawVisibleRange()
    expect(range.start).toBeLessThanOrEqual(8)
    expect(range.end).toBeGreaterThan(10)
    expect(module.readonly.scrollLeftLogical()).toBe(
      module.readonly.viewSnapshot().scrollBounds.max,
    )
  })

  it('分时视图不横向平移，窗口覆盖全部数据', () => {
    const module = createViewportFixture({ dataLength: 240, period: 'timeshare', width: 900 })
    module.actions.scrollToLogical(0)
    expect(module.readonly.rawVisibleRange()).toEqual({ start: -1, end: 240 })
    expect(module.readonly.visibleRange()).toEqual({ start: 0, end: 240 })
  })
})
