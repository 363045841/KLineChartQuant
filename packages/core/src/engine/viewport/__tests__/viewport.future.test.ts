/** 过去与未来槽位扩展：DOM 内容边界不能改变世界坐标。 */
import { describe, expect, it } from 'vitest'
import { createViewportStateDeps } from '../../state/__tests__/helpers/createViewportStateDeps'
import { createViewportState } from '../../state/viewportState'

describe('两侧空白槽位', () => {
  it.each([1, 1.25, 1.5, 2])('DPR=%s：允许整屏过去和整屏未来', (dpr) => {
    const module = createViewportState(createViewportStateDeps({ dataLength: 10 }))
    module.actions.resize(613, 400, dpr)
    for (const target of [-10000, 10000, -20000, 20000, 0]) {
      module.actions.scrollToLogical(target)
      expect(module.readonly.scrollLeftLogical()).toBeCloseTo(target, 10)
      expect(module.readonly.viewport().scrollLeft).toBeCloseTo(target, 10)
      expect(module.readonly.scrollLeft()).toBeGreaterThanOrEqual(0)
      expect(module.readonly.contentWidth() - module.readonly.scrollLeft()).toBeGreaterThanOrEqual(
        613,
      )
      if (target < -613) {
        expect(module.readonly.rawVisibleRange().end).toBeLessThan(0)
        expect(module.readonly.visibleRange()).toEqual({ start: 0, end: 0 })
      }
      if (target > 1000) expect(module.readonly.rawVisibleRange().start).toBeGreaterThan(10)
    }
  })

  it('扩展后缩小数据范围，不会拉回原来的数据边界', () => {
    const deps = createViewportStateDeps({ dataLength: 100 })
    const module = createViewportState(deps)
    module.actions.resize(400, 400, 1)
    module.actions.scrollToLogical(10000)
    deps.dataLength$.set(1)
    expect(module.readonly.scrollLeftLogical()).toBe(10000)
    expect(module.readonly.contentWidth()).toBeGreaterThan(module.readonly.scrollLeft() + 400)
  })
})
