/** 槽位边界：空窗、越界滚动与分时固定窗口。 */
import { describe, expect, it } from 'vitest'

import { createViewportFixture } from './helpers/viewportFixture'

describe('K 线槽位边界', () => {
  it.each([1, 2])('DPR=%s 下极端滚动只会停在边界，且至少露出两根 K 线', (dpr) => {
    const viewport = createViewportFixture({ dataLength: 10, width: 613, height: 400, dpr })
    for (const target of [-10_000, 10_000, -20_000, 20_000, 0]) {
      viewport.actions.commitScroll(target)
      const view = viewport.readonly.viewSnapshot()
      const scroll = view.scroll
      expect(viewport.readonly.viewport().scrollLeft).toBe(scroll)
      expect(viewport.readonly.domScroll()).toBeGreaterThanOrEqual(0)
      expect(scroll).toBeGreaterThanOrEqual(-613)
      expect(scroll + 613).toBeLessThanOrEqual(view.seriesWidth + 613)
      const visible = view.positions.filter((left, index) => {
        const dataIndex = view.range.start + index
        return (
          dataIndex < 10 &&
          left >= scroll - 1e-9 &&
          left + view.kWidthPx / dpr - 1 / dpr <= scroll + 613 + 1e-9
        )
      })
      expect(visible.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('分时视图固定窗口，任何横向提交都不产生滚动', () => {
    const viewport = createViewportFixture({ dataLength: 240, period: 'timeshare', width: 900 })
    expect(viewport.actions.commitScroll(500)).toBe(false)
    expect(viewport.readonly.scroll()).toBe(0)
    expect(viewport.readonly.contentWidth()).toBe(viewport.readonly.plotWidth())
    expect(viewport.readonly.viewSnapshot().capabilities.allowPan).toBe(false)
  })
})
