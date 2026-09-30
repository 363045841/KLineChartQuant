/** 未来区边界回归：按真实物理槽位判断屏内数据，不把渲染扩窗算作可见数据。 */
import { describe, expect, it } from 'vitest'
import { createViewportStateDeps } from '../../state/__tests__/helpers/createViewportStateDeps'
import { createViewportState } from '../../state/viewportState'
import { getPhysicalKLineConfig } from '../../utils/klineConfig'

/** 检查最右位置的两个完整数据槽位以及内容、滚动和未来区的一致性。 */
function expectRightBoundary(module: ReturnType<typeof createViewportState>, dataLength: number) {
  module.actions.scrollTo(Number.MAX_SAFE_INTEGER)
  const vp = module.readonly.viewport()
  const { unitPx } = getPhysicalKLineConfig(
    module.readonly.viewportState().kWidth,
    module.readonly.kGap(),
    vp.dpr,
  )
  // 槽位按实际屏幕坐标校验，避免 rawVisibleRange 的左侧扩窗掩盖整屏未来区。
  const penultimateLeft = (dataLength - 2) * unitPx - vp.scrollLeft * vp.dpr
  const lastRight = dataLength * unitPx - vp.scrollLeft * vp.dpr
  expect(penultimateLeft).toBeCloseTo(0)
  expect(lastRight).toBeLessThanOrEqual(vp.plotWidth * vp.dpr)
  expect(module.readonly.contentWidth() - vp.viewWidth).toBeCloseTo(module.readonly.scrollLeft())
  expect(module.readonly.contentGeometry().futureWidth).toBeCloseTo(
    vp.plotWidth - lastRight / vp.dpr,
  )
  expect(module.readonly.visibleRange().end).toBeGreaterThan(dataLength)
}

describe('动态未来区', () => {
  it.each([
    { width: 400, dpr: 1, kWidth: 8, dataLength: 100 },
    { width: 1000, dpr: 2, kWidth: 9, dataLength: 100 },
    { width: 613, dpr: 1.25, kWidth: 17.4, dataLength: 10 },
    { width: 320, dpr: 1.5, kWidth: 21, dataLength: 2 },
  ])('右移极限保留两个槽位：$width / DPR $dpr', ({ width, dpr, kWidth, dataLength }) => {
    const module = createViewportState(createViewportStateDeps({ dataLength, options: { kWidth } }))
    module.actions.resize(width, 400, dpr)
    expectRightBoundary(module, dataLength)
  })

  it('resize、缩放和数据替换后自动重新派生边界', () => {
    const deps = createViewportStateDeps({ dataLength: 100 })
    const module = createViewportState(deps)
    module.actions.resize(400, 400, 1)
    expectRightBoundary(module, 100)
    const firstFutureWidth = module.readonly.contentGeometry().futureWidth
    module.actions.resize(900, 400, 2)
    expectRightBoundary(module, 100)
    expect(module.readonly.contentGeometry().futureWidth).toBeGreaterThan(firstFutureWidth)
    deps.options$.set({ ...deps.options$.peek(), kWidth: 21 })
    expectRightBoundary(module, 100)
    deps.dataLength$.set(10)
    // 请求量仍是旧位置时，派生的当前位置也必须立即受新边界限制。
    expect(module.readonly.scrollLeft()).toBe(module.readonly.maxScrollLeft())
    expectRightBoundary(module, 10)
  })

  it.each([0, 1])('只有 %i 根数据时保留全部已有数据', (dataLength) => {
    const module = createViewportState(createViewportStateDeps({ dataLength }))
    module.actions.resize(400, 400, 1)
    module.actions.scrollTo(Number.MAX_SAFE_INTEGER)
    expect(module.readonly.scrollLeftLogical()).toBe(0)
    expect(module.readonly.contentGeometry().futureBarCount).toBe(dataLength === 0 ? 0 : 39)
  })

  it('视图不足两个槽位宽时不再增加未来区', () => {
    const module = createViewportState(
      createViewportStateDeps({ dataLength: 10, options: { kWidth: 100 } }),
    )
    module.actions.resize(100, 400, 1)
    module.actions.scrollTo(Number.MAX_SAFE_INTEGER)
    expect(module.readonly.contentGeometry().futureWidth).toBe(0)
    expect(module.readonly.contentGeometry().futureBarCount).toBe(0)
    expect(module.readonly.scrollLeftLogical()).toBeLessThan(9 * 102)
  })
})
