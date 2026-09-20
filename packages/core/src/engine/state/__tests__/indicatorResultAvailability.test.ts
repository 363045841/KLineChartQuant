/** 指标结果可用性 Kernel 集成测试。 */
import { describe, expect, it } from 'vitest'

import { createTestChartStateKernel } from './helpers/createTestChartStateKernel'

describe('indicatorResultAvailability', () => {
  it('marks an older committed result stale after indicator configuration changes', () => {
    const kernel = createTestChartStateKernel()
    const dataRevision = kernel.data.readonly.dataRevision.peek()
    const configRevision = kernel.indicator.readonly.configRevision.peek()
    kernel.indicatorResult.actions.beginCalculation({
      requestId: 1,
      dataRevision,
      configRevision,
    })
    kernel.indicatorResult.actions.commitResults({
      requestId: 1,
      dataRevision,
      configRevision,
      bundle: { _changed: [] } as never,
      timestamps: [],
      instanceResults: [],
      renderStates: new Map(),
    })
    expect(kernel.indicatorResultAvailability$()).toBe('ready')

    kernel.indicator.actions.upsertMain('MA', { ma5: true })
    expect(kernel.indicatorResultAvailability$()).toBe('stale')
  })
})
