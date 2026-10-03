/** 槽位导航边界：两侧空白最多一屏，并保留两根完整 K 线。 */
import { describe, expect, it } from 'vitest'
import { createViewportStateDeps } from '../../state/__tests__/helpers/createViewportStateDeps'
import { createViewportState } from '../../state/viewportState'

describe('K 线槽位边界', () => {
  it.each([1, 1.25, 1.5, 2])('DPR=%s：极端导航仍保留两根完整 K 线', (dpr) => {
    const module = createViewportState(createViewportStateDeps({ dataLength: 10 }))
    module.actions.resize(613, 400, dpr)
    for (const target of [-10000, 10000, -20000, 20000, 0]) {
      module.actions.scrollToLogical(target)
      const view = module.readonly.viewSnapshot()
      const scroll = view.scroll
      expect(scroll).toBeCloseTo(
        Math.max(view.scrollBounds.min, Math.min(target, view.scrollBounds.max)),
        10,
      )
      expect(module.readonly.viewport().scrollLeft).toBe(scroll)
      expect(module.readonly.scrollLeft()).toBeGreaterThanOrEqual(0)
      expect(scroll).toBeGreaterThanOrEqual(-613)
      expect(scroll + 613).toBeLessThanOrEqual(view.seriesWidth + 613)
      const visible = view.bars.filter((bar, index) => {
        const dataIndex = view.range.start + index
        return (
          dataIndex < 10 &&
          bar.x >= scroll - 1e-9 &&
          bar.x + bar.width - 1 / dpr <= scroll + 613 + 1e-9
        )
      })
      expect(visible.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('普通分时固定零滚动，不接受任何横向导航', () => {
    const module = createViewportState(
      createViewportStateDeps({ dataLength: 240, period: 'timeshare' }),
    )
    module.actions.resize(900, 400, 1)
    module.actions.scrollToLogical(500)
    module.actions.scrollTo(500)
    expect(module.readonly.scrollLeftLogical()).toBe(0)
    expect(module.readonly.contentWidth()).toBe(module.readonly.plotWidth())
    expect(module.readonly.viewSnapshot().capabilities.allowPan).toBe(false)
  })
})
