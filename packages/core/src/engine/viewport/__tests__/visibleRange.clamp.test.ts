/** 可见范围的扩窗、索引边界和分时网格回归。 */
import { describe, expect, it } from 'vitest'
import { createViewportStateDeps } from '../../state/__tests__/helpers/createViewportStateDeps'
import { createViewportState } from '../../state/viewportState'
import { clampVisibleRange, getVisibleRange } from '../viewport'

describe('clampVisibleRange', () => {
  it.each([
    { raw: { start: -1, end: 40 }, expected: { start: 0, end: 40 } },
    { raw: { start: 12, end: 50 }, expected: { start: 12, end: 50 } },
  ])('只钳制负起点：$raw.start', ({ raw, expected }) => {
    expect(clampVisibleRange(raw)).toEqual(expected)
  })
})

describe('viewportState visibleRange SSOT', () => {
  it('保留加载用 raw 扩窗，对外提供非负数据索引', () => {
    const module = createViewportState(createViewportStateDeps({ dataLength: 20 }))
    module.actions.resize(800, 400, 1)
    module.actions.scrollTo(module.readonly.leftLoadBufferWidth())
    const raw = module.readonly.rawVisibleRange()
    expect(raw.start).toBeLessThan(0)
    expect(module.readonly.visibleRange()).toEqual({ start: 0, end: raw.end })
    expect(module.readonly.viewportState().visibleFrom).toBe(0)
    expect(getVisibleRange(0, 800, 8, 2, 100).start).toBeLessThan(0)
  })

  it('未来可见范围按世界槽位推导，不受初始未来槽位数量限制', () => {
    const module = createViewportState(createViewportStateDeps({ dataLength: 10 }))
    module.actions.resize(400, 400, 1)
    module.actions.scrollToLogical(1000)
    expect(module.readonly.contentGeometry().futureBarCount).toBe(40)
    expect(module.readonly.rawVisibleRange()).toEqual({ start: 98, end: 141 })
  })

  it('分时沿交易槽位计算完整数据范围', () => {
    const module = createViewportState(
      createViewportStateDeps({ dataLength: 240, options: { kWidth: 3 }, period: 'timeshare' }),
    )
    module.actions.resize(900, 400, 1)
    module.actions.scrollToLogical(0)
    expect(module.readonly.rawVisibleRange()).toEqual({ start: -1, end: 240 })
    expect(module.readonly.visibleRange()).toEqual({ start: 0, end: 240 })
    expect(module.readonly.contentGeometry().futureBarCount).toBe(0)
  })
})
