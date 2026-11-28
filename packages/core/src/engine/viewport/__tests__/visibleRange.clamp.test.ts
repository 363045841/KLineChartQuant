/** 可见槽位范围与原始窗口的边界回归：导航是唯一写入点。 */
import { describe, expect, it } from 'vitest'

import { createViewportFixture } from './helpers/viewportFixture'

describe('viewportState visibleRange', () => {
  it('左加载缓冲只扩展原始窗口，可见范围从 0 开始', () => {
    const viewport = createViewportFixture({ dataLength: 20 })
    viewport.actions.commitScroll(0)
    const raw = viewport.readonly.rawVisibleRange()
    expect(raw.start).toBeLessThan(0)
    expect(viewport.readonly.visibleRange()).toEqual({ start: 0, end: raw.end })
    expect(viewport.readonly.viewportState().visibleFrom).toBe(0)
  })

  it('向右越界被夹到末尾，并保留末尾缓存 K 线', () => {
    const viewport = createViewportFixture({ dataLength: 10, width: 400 })
    viewport.actions.commitScroll(1_000)
    const range = viewport.readonly.rawVisibleRange()
    expect(range.start).toBeLessThanOrEqual(8)
    expect(range.end).toBeGreaterThan(10)
    expect(viewport.readonly.scroll()).toBe(viewport.readonly.viewSnapshot().scrollBounds.max)
  })

  it('分时视图不横向平移，窗口覆盖全部数据', () => {
    const viewport = createViewportFixture({ dataLength: 240, period: 'timeshare', width: 900 })
    viewport.actions.commitScroll(200)
    expect(viewport.readonly.rawVisibleRange()).toEqual({ start: -1, end: 240 })
    expect(viewport.readonly.visibleRange()).toEqual({ start: 0, end: 240 })
  })

  it('越界滚动不写入，重复提交同一导航返回 false', () => {
    const viewport = createViewportFixture({ dataLength: 10, width: 400 })
    expect(viewport.actions.commitScroll(0)).toBe(true)
    expect(viewport.actions.commitScroll(1_000)).toBe(true)
    expect(viewport.actions.commitScroll(1_000)).toBe(false)
    expect(viewport.actions.commitScroll(Number.NaN)).toBe(false)
  })
})
