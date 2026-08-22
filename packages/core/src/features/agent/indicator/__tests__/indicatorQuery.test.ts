// 本文件验证 Agent 指标查询保留原入参，同时只向调用方返回紧凑文本。

import { describe, expect, it } from 'vitest'

import type { IndicatorMetadata } from '../../../../engine/indicators/indicatorMetadata'
import { createDataState } from '../../../../engine/state/dataState'
import type { KLineData } from '../../../../foundation/types/price'
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

/** 发布测试 K 线数据。 */
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
  it('keeps the existing query input and returns a Markdown table', async () => {
    const dataState = createDataState()
    publishBars(dataState, createBars(10))
    const query = createIndicatorQuery({
      dataState,
      resolveDefinition: () => createAverageDefinition(),
    })

    const result = await query.queryIndicator({
      definitionId: 'average',
      params: { period: 2 },
      from: 3000,
      to: 8000,
      limit: 3,
    })

    expect(result).toBe(`average | period=2

| date | value |
| --- | --- |
| 1970-01-01 08:00 | 5.5 |
| 1970-01-01 08:00 | 6.5 |
| 1970-01-01 08:00 | 7.5 |`)
  })

  it('formats object series with field names only in the Markdown header', async () => {
    const dataState = createDataState()
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
      resolveDefinition: () => definition,
    })

    await expect(query.queryIndicator({ definitionId: 'dual' })).resolves.toBe(`dual

| date | first | second | direction |
| --- | --- | --- | --- |
| 1970-01-01 08:00 | 1 | - | up |
| 1970-01-01 08:00 | 2 | 2 | up |`)
  })

  it('uses the Structure formatter instead of rejecting non-aligned results', async () => {
    const dataState = createDataState()
    publishBars(dataState, createBars(3))
    const definition: Pick<IndicatorMetadata, 'name' | 'runtime'> = {
      name: 'structure',
      runtime: {
        defaultParams: {},
        computeKey: 'testStructure',
        outputAlignment: 'aggregate',
        compute: () => ({
          trend: 'up',
          swings: [],
          events: [{ kind: 'BOS', direction: 'up', triggerPrice: 5, index: 1 }],
        }),
      },
    }
    const query = createIndicatorQuery({
      dataState,
      resolveDefinition: () => definition,
    })

    await expect(query.queryIndicator({ definitionId: 'structure' })).resolves.toBe(`Structure
趋势：向上
BOS 向上 5 @ 1970-01-01 08:00`)
  })

  it('retries with the latest market data when data changes during calculation', async () => {
    const dataState = createDataState()
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
      resolveDefinition: () => definition,
    })

    const result = await query.queryIndicator({ definitionId: 'latest' })

    expect(calculationCount).toBe(2)
    expect(result).toContain('| 1970-01-01 08:00 | 1 |')
    expect(result).toContain('| 1970-01-01 08:00 | 3 |')
  })

  it('rejects invalid numeric parameters', async () => {
    const dataState = createDataState()
    publishBars(dataState, createBars(2))
    const query = createIndicatorQuery({
      dataState,
      resolveDefinition: () => createAverageDefinition(),
    })

    await expect(
      query.queryIndicator({ definitionId: 'average', params: { period: NaN } }),
    ).rejects.toMatchObject({ code: 'INVALID_PARAM' })
    await expect(
      query.queryIndicator({ definitionId: 'average', params: { showAverage: 1 } }),
    ).rejects.toMatchObject({ code: 'INVALID_PARAM' })
  })
})
