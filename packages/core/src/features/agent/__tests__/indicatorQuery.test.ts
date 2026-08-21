// 本文件验证 Agent 指标查询的计算、结果池提交和 DTO 边界。

import { describe, expect, it } from 'vitest'

import type { KLineData } from '../../../foundation/types/price'
import { createDataState } from '../../../engine/state/dataState'
import type { IndicatorMetadata } from '../../../engine/indicators/indicatorMetadata'
import { INDICATOR_RESULT_OWNER } from '../../../engine/state/indicatorResultModel'
import { createIndicatorResultState } from '../../../engine/state/indicatorResultState'
import { createIndicatorQuery } from '../indicatorQuery'

const BAR_SELECTION = {
  kind: 'bars' as const,
  instrumentKey: 'TEST',
  sourceId: 'test',
  period: 'daily' as const,
  adjustment: 'none' as const,
}

/** 创建连续收盘价的 K 线测试数据。 */
function createBars(length: number, timestampOffset = 0): KLineData[] {
  return Array.from({ length }, (_, index) => ({
    timestamp: timestampOffset + (index + 1) * 1000,
    open: index + 1,
    high: index + 2,
    low: index,
    close: index + 1,
    volume: 100,
  }))
}

/** 将 K 线发布为当前活动行情。 */
function publishBars(dataState: ReturnType<typeof createDataState>, data: KLineData[]): void {
  dataState.actions.applyActiveBufferSnapshot({
    kind: 'bars',
    selection: BAR_SELECTION,
    data,
    loading: false,
    error: null,
    timeShareRange: null,
    timeSharePreClose: null,
  })
}

/** 创建支持自定义 period 的按 K 线对齐指标定义。 */
function createAverageDefinition(): Pick<IndicatorMetadata, 'name' | 'runtime'> {
  return {
    name: 'average',
    runtime: {
      defaultParams: { period: 3 },
      computeKey: 'testAverage',
      compute: (data, config) => {
        const period = (config as { period: number }).period
        return data.map((_, index) => {
          if (index < period - 1) return undefined
          let sum = 0
          for (let offset = index - period + 1; offset <= index; offset++) {
            sum += data[offset]!.close
          }
          return sum / period
        })
      },
    },
  }
}

describe('createIndicatorQuery', () => {
  it('calculates with full data, commits an Agent result, and returns the latest range points', async () => {
    const dataState = createDataState()
    const resultState = createIndicatorResultState()
    publishBars(dataState, createBars(10))
    const query = createIndicatorQuery({
      dataState,
      resultState,
      resolveDefinition: () => createAverageDefinition(),
    })

    const result = await query.queryIndicator({
      definitionId: 'average',
      params: { period: 2 },
      from: 3000,
      to: 8000,
      limit: 3,
    })

    expect(result).toEqual({
      definitionId: 'average',
      params: { period: 2 },
      points: [
        { timestamp: 6000, values: { value: 5.5 } },
        { timestamp: 7000, values: { value: 6.5 } },
        { timestamp: 8000, values: { value: 7.5 } },
      ],
    })
    const snapshot = resultState.readonly.snapshot.peek()
    expect(snapshot.committed).toBeNull()
    expect([...snapshot.pool!.results.values()][0]).toMatchObject({
      owner: INDICATOR_RESULT_OWNER.AGENT,
      definitionId: 'average',
      firstReadyIndex: 1,
    })

    const defaultResult = await query.queryIndicator({ definitionId: 'average', limit: 1 })
    expect(defaultResult.params).toEqual({ period: 3 })
  })

  it('converts object series fields and missing values to the point DTO', async () => {
    const dataState = createDataState()
    const resultState = createIndicatorResultState()
    publishBars(dataState, createBars(2))
    const definition: Pick<IndicatorMetadata, 'name' | 'runtime'> = {
      name: 'dual',
      runtime: {
        defaultParams: {},
        computeKey: 'testDual',
        compute: (data) =>
          data.map((bar, index) => ({
            first: bar.close,
            second: index ? 2 : undefined,
            direction: 'up',
          })),
      },
    }
    const query = createIndicatorQuery({
      dataState,
      resultState,
      resolveDefinition: () => definition,
    })

    await expect(query.queryIndicator({ definitionId: 'dual' })).resolves.toMatchObject({
      points: [
        { timestamp: 1000, values: { first: 1, second: null } },
        { timestamp: 2000, values: { first: 2, second: 2 } },
      ],
    })
  })

  it('retries with the latest market data when data changes during calculation', async () => {
    const dataState = createDataState()
    const resultState = createIndicatorResultState()
    publishBars(dataState, createBars(2))
    let calculationCount = 0
    const definition: Pick<IndicatorMetadata, 'name' | 'runtime'> = {
      name: 'latest',
      runtime: {
        defaultParams: {},
        computeKey: 'testLatest',
        compute: (data) => {
          calculationCount++
          if (calculationCount === 1) publishBars(dataState, createBars(3, 10_000))
          return data.map((bar) => bar.close)
        },
      },
    }
    const query = createIndicatorQuery({
      dataState,
      resultState,
      resolveDefinition: () => definition,
    })

    const result = await query.queryIndicator({ definitionId: 'latest' })

    expect(calculationCount).toBe(2)
    expect(result.points.map((point) => point.timestamp)).toEqual([11_000, 12_000, 13_000])
    expect(resultState.readonly.snapshot.peek().pool?.dataRevision).toBe(2)
  })

  it('rejects invalid numeric parameters and aggregate outputs', async () => {
    const dataState = createDataState()
    const resultState = createIndicatorResultState()
    publishBars(dataState, createBars(2))
    const aggregateDefinition: Pick<IndicatorMetadata, 'name' | 'runtime'> = {
      name: 'aggregate',
      runtime: {
        defaultParams: {},
        computeKey: 'testAggregate',
        outputAlignment: 'aggregate',
        compute: () => ({ total: 1 }),
      },
    }

    const invalidParamsQuery = createIndicatorQuery({
      dataState,
      resultState,
      resolveDefinition: () => createAverageDefinition(),
    })
    await expect(
      invalidParamsQuery.queryIndicator({ definitionId: 'average', params: { period: NaN } }),
    ).rejects.toMatchObject({ code: 'INVALID_PARAM' })
    await expect(
      invalidParamsQuery.queryIndicator({ definitionId: 'average', params: { showAverage: 1 } }),
    ).rejects.toMatchObject({ code: 'INVALID_PARAM' })

    const aggregateQuery = createIndicatorQuery({
      dataState,
      resultState,
      resolveDefinition: () => aggregateDefinition,
    })
    await expect(
      aggregateQuery.queryIndicator({ definitionId: 'aggregate' }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_CAPABILITY' })
  })
})
