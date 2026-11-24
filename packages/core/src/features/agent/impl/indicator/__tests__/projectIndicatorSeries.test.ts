/** 指标序列投影：列、行、绘图对象与边界都由同一次计算结果决定。 */

import type { IndicatorSeries } from '@363045841yyt/klinechart-plot-contracts'
import { describe, expect, it } from 'vitest'
import type { IndicatorResult } from '@/engine/indicators/instances/domain/indicatorModel.js'
import { CHART_AGENT_ERROR_CODES } from '@/errors.js'
import { projectIndicatorSeries } from '../projectIndicatorSeries'

const TIMESTAMPS = [
  Date.parse('2026-09-01T00:00:00Z'),
  Date.parse('2026-09-02T00:00:00Z'),
  Date.parse('2026-09-03T00:00:00Z'),
]

/** 构造一次计算结果；只声明用例关心的字段。 */
function result(series: IndicatorSeries, timestamps = TIMESTAMPS): IndicatorResult {
  return {
    timestamps,
    dataRevision: 1,
    marketRevision: 0,
    series,
  }
}

/** 构造一条标量通道；默认可见、无偏移。 */
function line(id: string, values: (number | null)[], overrides: Record<string, unknown> = {}) {
  return {
    kind: 'line' as const,
    id,
    label: id.toUpperCase(),
    data: values.map((value) => (value === null ? undefined : { value, color: '#fff' })),
    visible: true,
    offset: 0,
    size: 'auto' as never,
    dash: [],
    ...overrides,
  }
}

describe('projectIndicatorSeries', () => {
  it('projects plot channels into columns and rows with index and ISO time', () => {
    const view = projectIndicatorSeries({
      result: result({ plots: [line('zz', [3176.08, null, 3201.44])], fills: [] }),
      limit: 10,
      period: 'daily',
      timezone: 'UTC',
    })
    expect(view.series.columns).toEqual([{ id: 'zz', label: 'ZZ', kind: 'line' }])
    expect(view.series.rows).toEqual([
      [0, '2026-09-01', 3176.08],
      [1, '2026-09-02', null],
      [2, '2026-09-03', 3201.44],
    ])
    expect(view.truncated).toBeUndefined()
  })

  it('expands OHLC plots into four columns and skips invisible channels', () => {
    const view = projectIndicatorSeries({
      result: result({
        plots: [
          {
            kind: 'candle',
            id: 'htf',
            label: '高周期',
            data: [
              {
                open: 1,
                high: 4,
                low: 0.5,
                close: 3,
                color: null,
                wickColor: null,
                borderColor: null,
              },
            ],
            visible: true,
            offset: 0,
          },
          line('hidden', [1, 2, 3], { visible: false }),
        ],
        fills: [],
      }),
      limit: 10,
      period: 'daily',
      timezone: 'UTC',
    })
    expect(view.series.columns.map((column) => column.id)).toEqual([
      'htf.open',
      'htf.high',
      'htf.low',
      'htf.close',
    ])
    expect(view.series.rows[0]).toEqual([0, '2026-09-01', 1, 4, 0.5, 3])
  })

  it('keeps marker location and text in the column declaration', () => {
    const view = projectIndicatorSeries({
      result: result({
        plots: [
          {
            kind: 'shape',
            id: 'signal',
            label: 'Signal',
            data: [
              { value: 10, color: '#fff', textColor: '#fff' },
              undefined,
              { value: 12, color: '#fff', textColor: '#fff' },
            ],
            visible: true,
            offset: 0,
            size: 'auto' as never,
            location: 'abovebar',
            text: 'HH',
            style: 'xcross',
          },
        ],
        fills: [],
      }),
      limit: 10,
      period: 'daily',
      timezone: 'UTC',
    })
    expect(view.series.columns[0]).toMatchObject({
      id: 'signal',
      kind: 'shape',
      location: 'abovebar',
      text: 'HH',
    })
  })

  it('applies plot offset when reading values', () => {
    const view = projectIndicatorSeries({
      result: result({ plots: [line('shifted', [1, 2, 3], { offset: 1 })], fills: [] }),
      limit: 10,
      period: 'daily',
      timezone: 'UTC',
    })
    expect(view.series.rows.map((row) => row[2])).toEqual([null, 1, 2])
  })

  it('projects drawings with bar index, time, price and text, newest last', () => {
    const view = projectIndicatorSeries({
      result: result({
        plots: [line('zz', [1, 2, 3])],
        fills: [],
        drawings: [
          {
            id: 'l1',
            kind: 'label',
            paneId: 'main',
            visible: true,
            anchors: [{ id: 'a1', logicalIndex: 0, price: 100 }],
            params: {},
            style: { stroke: '#fff' },
            text: { value: 'bottom', align: 'center', verticalAlign: 'middle' },
          },
          {
            id: 'l2',
            kind: 'label',
            paneId: 'main',
            visible: true,
            anchors: [{ id: 'a2', logicalIndex: 2, price: 200 }],
            params: {},
            style: { stroke: '#fff' },
            text: { value: 'top', align: 'center', verticalAlign: 'middle' },
          },
        ],
      }),
      limit: 1,
      period: 'daily',
      timezone: 'UTC',
    })
    expect(view.objects).toEqual([
      { kind: 'label', index: 2, time: '2026-09-03', price: 200, text: 'top' },
    ])
    expect(view.truncated).toEqual({ rows: 2, objects: 1 })
  })

  it('projects hlines with their title', () => {
    const view = projectIndicatorSeries({
      result: result({
        plots: [line('zz', [1, 2, 3])],
        fills: [],
        hlines: [{ id: '0', price: 80, color: '#fff', dash: [], width: 1, title: 'overbought' }],
      }),
      limit: 10,
      period: 'daily',
      timezone: 'UTC',
    })
    expect(view.hlines).toEqual([{ id: '0', price: 80, title: 'overbought' }])
  })

  it('filters by date window for daily and formats intraday as RFC 3339', () => {
    const daily = projectIndicatorSeries({
      result: result({ plots: [line('zz', [1, 2, 3])], fills: [] }),
      from: '2026-09-02',
      to: '2026-09-03',
      limit: 10,
      period: 'daily',
      timezone: 'UTC',
    })
    expect(daily.series.rows.map((row) => row[0])).toEqual([1, 2])

    const intraday = projectIndicatorSeries({
      result: result({ plots: [line('zz', [1, 2, 3])], fills: [] }),
      from: '2026-09-02T00:00:00+00:00',
      to: '2026-09-03T00:00:00+00:00',
      limit: 10,
      period: '5min',
      timezone: 'UTC',
    })
    expect(intraday.series.rows).toEqual([
      [1, '2026-09-02T00:00:00+00:00', 2],
      [2, '2026-09-03T00:00:00+00:00', 3],
    ])
  })

  it('rejects output that is not a readable series', () => {
    expect(() =>
      projectIndicatorSeries({
        result: result(undefined as never),
        limit: 10,
        period: 'daily',
        timezone: 'UTC',
      }),
    ).toThrow(expect.objectContaining({ code: CHART_AGENT_ERROR_CODES.UNREADABLE_SERIES }))
  })
})
