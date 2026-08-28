// 本文件验证 Agent 指标查询保留原入参，同时只向调用方返回紧凑文本。

import { describe, expect, it, vi } from 'vitest'

import { createDataState } from '../../../../engine/state/dataState'
import { CHART_AGENT_ERROR_CODES } from '../../errors'
import { createIndicatorQuery } from '../indicatorQuery'

import type { IndicatorMetadata } from '../../../../engine/indicators/indicatorMetadata'
import type { KLineData } from '../../../../foundation/types/price'
import type { IndicatorQueryInput } from '../../types'

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
    ).rejects.toMatchObject({ code: CHART_AGENT_ERROR_CODES.INVALID_QUERY })
    await expect(
      query.queryIndicator({ definitionId: 'average', params: { showAverage: 1 } }),
    ).rejects.toMatchObject({ code: CHART_AGENT_ERROR_CODES.INVALID_QUERY })
  })

  it.each([
    ['missing definitionId', {}],
    ['null params', { definitionId: 'average', params: null }],
    ['array params', { definitionId: 'average', params: [14] }],
    ['string params', { definitionId: 'average', params: { period: '14' } }],
    ['infinite params', { definitionId: 'average', params: { period: Infinity } }],
    ['NaN from', { definitionId: 'average', from: Number.NaN }],
    ['infinite to', { definitionId: 'average', to: Infinity }],
    ['zero limit', { definitionId: 'average', limit: 0 }],
    ['negative limit', { definitionId: 'average', limit: -1 }],
    ['fractional limit', { definitionId: 'average', limit: 1.5 }],
  ])('rejects runtime-invalid input: %s', async (_case, input) => {
    const dataState = createDataState()
    publishBars(dataState, createBars(5))
    const query = createIndicatorQuery({
      dataState,
      resolveDefinition: () => createAverageDefinition(),
    })

    await expect(query.queryIndicator(input as IndicatorQueryInput)).rejects.toMatchObject({
      code: CHART_AGENT_ERROR_CODES.INVALID_QUERY,
    })
  })

  it('preserves the default 20 and hard maximum 2000 limits', async () => {
    const dataState = createDataState()
    publishBars(dataState, createBars(2_000))
    const format = vi.fn(() => 'compact')
    const query = createIndicatorQuery({
      dataState,
      resolveDefinition: () => createAverageDefinition(),
      textFormatter: { format },
    })

    await expect(query.queryIndicator({ definitionId: 'average' })).resolves.toBe('compact')
    expect(format).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 20 }))

    await expect(query.queryIndicator({ definitionId: 'average', limit: 2_000 })).resolves.toBe(
      'compact',
    )
    expect(format).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 2_000 }))

    await expect(
      query.queryIndicator({ definitionId: 'average', limit: 2_001 }),
    ).rejects.toMatchObject({ code: CHART_AGENT_ERROR_CODES.INVALID_QUERY })
  })

  it('returns distinct stable codes for missing data, indicator, and range', async () => {
    const dataState = createDataState()
    const query = createIndicatorQuery({
      dataState,
      resolveDefinition: (definitionId) =>
        definitionId === 'average' ? createAverageDefinition() : undefined,
    })

    await expect(query.queryIndicator({ definitionId: 'average' })).rejects.toMatchObject({
      code: CHART_AGENT_ERROR_CODES.NO_DATA,
    })

    publishBars(dataState, createBars(5))
    await expect(query.queryIndicator({ definitionId: 'missing' })).rejects.toMatchObject({
      code: CHART_AGENT_ERROR_CODES.INDICATOR_NOT_FOUND,
    })
    await expect(
      query.queryIndicator({ definitionId: 'average', from: 10_000, to: 20_000 }),
    ).rejects.toMatchObject({ code: CHART_AGENT_ERROR_CODES.OUT_OF_RANGE })
    await expect(
      query.queryIndicator({ definitionId: 'average', from: 2_000, to: 1_000 }),
    ).rejects.toMatchObject({ code: CHART_AGENT_ERROR_CODES.INVALID_QUERY })
  })

  it('rejects an active time-share series because indicator queries require bars', async () => {
    const dataState = createDataState()
    dataState.actions.applyActiveBufferSnapshot({
      kind: 'timeShare',
      selection: {
        kind: 'timeShare',
        instrumentKey: 'TEST',
        sourceId: 'test',
        tradingDate: 'latest',
      },
      data: [{ timestamp: 1_000, price: 10, average: 10 }],
      loading: false,
      error: null,
      timeShareRange: null,
      timeSharePreClose: 9,
    })
    const query = createIndicatorQuery({
      dataState,
      resolveDefinition: () => createAverageDefinition(),
    })

    await expect(query.queryIndicator({ definitionId: 'average' })).rejects.toMatchObject({
      code: CHART_AGENT_ERROR_CODES.NO_DATA,
    })
  })

  it('fails with a stable revision code when data changes during both attempts', async () => {
    const dataState = createDataState()
    publishBars(dataState, createBars(2))
    let calculationCount = 0
    const definition: Pick<IndicatorMetadata, 'name' | 'runtime'> = {
      name: 'churn',
      runtime: {
        defaultParams: {},
        computeKey: 'testChurn',
        compute: (data) => {
          calculationCount++
          publishBars(dataState, createBars(data.length + 1, calculationCount * 10_000))
          return data.map((bar) => bar.close)
        },
      },
    }
    const query = createIndicatorQuery({ dataState, resolveDefinition: () => definition })

    await expect(query.queryIndicator({ definitionId: 'churn' })).rejects.toMatchObject({
      code: CHART_AGENT_ERROR_CODES.DATA_REVISION_CHANGED,
    })
    expect(calculationCount).toBe(2)
  })
})
