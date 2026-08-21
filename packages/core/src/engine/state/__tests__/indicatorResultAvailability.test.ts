/** 指标结果可用性 Kernel 集成测试。 */
import { describe, expect, it } from 'vitest'

import { ChartStateKernel } from '../chartStateKernel'
import { INDICATOR_RESULT_OWNER } from '../indicatorResultModel'

/** 创建满足状态测试的 Kernel。 */
function createKernel(): ChartStateKernel {
  return new ChartStateKernel({
    initialOptions: {
      minKWidth: 1,
      maxKWidth: 50,
      zoomLevelCount: 20,
      bottomAxisHeight: 24,
      rightAxisWidth: 0,
      leftAxisWidth: 0,
      yPaddingPx: 20,
      panes: [{ id: 'main', ratio: 1, visible: true, role: 'price' }],
    },
    initialZoomLevel: 1,
    scheduleDraw: () => {},
  })
}

describe('indicatorResultAvailability', () => {
  it('marks an older committed result stale after indicator configuration changes', () => {
    const kernel = createKernel()
    const dataRevision = kernel.data.readonly.dataRevision.peek()
    const configRevision = kernel.indicator.readonly.configRevision.peek()
    kernel.indicatorResult.actions.beginCalculation({
      requestId: 1,
      dataRevision,
      configRevision,
    })
    kernel.indicatorResult.actions.commitResults({
      owner: INDICATOR_RESULT_OWNER.CHART,
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
