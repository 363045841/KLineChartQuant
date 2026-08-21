/** IndicatorRuntime 实例级结果与对齐语义测试。 */
import { describe, expect, it } from 'vitest'

import type { KLineData } from '../../../foundation/types/price'
import { IndicatorRuntime } from '../indicatorRuntime'

/** 创建仅用于下标对齐测试的行情数据。 */
function createData(length: number): KLineData[] {
  return Array.from({ length }, (_, index) => ({
    timestamp: index * 1000,
    open: index,
    high: index + 1,
    low: index - 1,
    close: index,
    volume: index,
  }))
}

describe('IndicatorRuntime instance results', () => {
  it('derives the warm-up boundary from bar-aligned sparse series', () => {
    const runtime = new IndicatorRuntime([
      {
        configKey: 'bar-series',
        defaultConfig: {},
        computeKey: 'test-bar-series',
        compute: (data) => data.map((_, index) => (index < 2 ? undefined : index)),
      },
    ])
    runtime.setData(createData(4), 1)

    const [result] = runtime.computeInstanceSeries([
      {
        instanceId: 'bar-a',
        definitionId: 'bar-series',
        configKey: 'bar-series',
        paneId: 'main',
        params: {},
      },
    ])

    expect(result).toMatchObject({
      instanceId: 'bar-a',
      firstReadyIndex: 2,
    })
  })

  it('does not infer a warm-up boundary from aggregate arrays', () => {
    const runtime = new IndicatorRuntime([
      {
        configKey: 'aggregate',
        defaultConfig: {},
        computeKey: 'test-aggregate',
        outputAlignment: 'aggregate',
        compute: (data) => data.map((_, index) => ({ bin: index })),
      },
    ])
    runtime.setData(createData(4), 1)

    const [result] = runtime.computeInstanceSeries([
      {
        instanceId: 'aggregate-a',
        definitionId: 'aggregate',
        configKey: 'aggregate',
        paneId: 'main',
        params: {},
      },
    ])

    expect(result?.firstReadyIndex).toBeNull()
  })
})
