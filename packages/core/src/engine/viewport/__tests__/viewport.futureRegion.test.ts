/** 槽位边界：空窗、越界滚动与分时固定窗口。 */
import { describe, expect, it } from 'vitest'

import { createViewportFixture } from './helpers/viewportFixture'

describe('K 线槽位边界', () => {
  it.each([1, 2])('DPR=%s 下极端滚动只会停在边界，且至少露出两根 K 线', (dpr) => {
    const module = createViewportFixture({ dataLength: 10, width: 613, height: 400, dpr })
    for (const target of [-10000, 10000, -20000, 20000, 0]) {
      module.actions.scrollToLogical(target)
      const view = module.readonly.viewSnapshot()
      const scroll = view.scroll
      expect(module.readonly.viewport().scrollLeft).toBe(scroll)
      expect(module.readonly.scrollLeft()).toBeGreaterThanOrEqual(0)
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

  it('分时视图固定窗口，任何横向操作都不产生滚动', () => {
    const module = createViewportFixture({ dataLength: 240, period: 'timeshare', width: 900 })
    module.actions.scrollToLogical(500)
    module.actions.scrollTo(500)
    expect(module.readonly.scrollLeftLogical()).toBe(0)
    expect(module.readonly.contentWidth()).toBe(module.readonly.plotWidth())
    expect(module.readonly.viewSnapshot().capabilities.allowPan).toBe(false)
  })
})
