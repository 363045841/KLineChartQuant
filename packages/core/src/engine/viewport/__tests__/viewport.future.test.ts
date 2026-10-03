/** 无界槽位：过去与未来区域都是合法视口位置。 */
import { describe, expect, it } from 'vitest'
import { createViewportStateDeps } from '../../state/__tests__/helpers/createViewportStateDeps'
import { createViewportState } from '../../state/viewportState'

describe('无界 K 线槽位', () => {
  it.each([1, 1.25, 1.5, 2])('DPR=%s：允许整屏过去和整屏未来', (dpr) => {
    const module = createViewportState(createViewportStateDeps({ dataLength: 10 }))
    module.actions.resize(613, 400, dpr)
    for (const target of [-10000, 10000, -20000, 20000, 0]) {
      module.actions.scrollToLogical(target)
      expect(module.readonly.scrollLeftLogical()).toBeCloseTo(target, 10)
      expect(module.readonly.viewport().scrollLeft).toBeCloseTo(target, 10)
      expect(module.readonly.scrollLeft()).toBeGreaterThanOrEqual(0)
      if (target < -2000) expect(module.readonly.rawVisibleRange().end).toBeLessThan(0)
      if (target > 2000) expect(module.readonly.rawVisibleRange().start).toBeGreaterThan(10)
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
