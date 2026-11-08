/** 视口几何输入：密度只改变槽距，实体宽度仍由缩放级别派生。 */
import { describe, expect, it } from 'vitest'

import { KLINE_DENSITY } from '@/foundation/config/chartSettings'
import { createTestChartStateKernel } from './helpers/createTestChartStateKernel'

describe('viewportGeometry', () => {
  it('切换密度只改变 kGap，kWidth 保持不变', () => {
    const kernel = createTestChartStateKernel({ initialZoomLevel: 10 })
    kernel.viewport.actions.resize(800, 600, 1)

    const before = kernel.viewport.readonly.viewportState.peek()
    kernel.settings.actions.patch({ klineDensity: KLINE_DENSITY.Loose })
    const after = kernel.viewport.readonly.viewportState.peek()

    expect(after.kWidth).toBe(before.kWidth)
    expect(after.kGap).toBeGreaterThan(before.kGap)
  })
})
