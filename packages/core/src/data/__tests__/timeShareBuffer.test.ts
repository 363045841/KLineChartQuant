import { describe, expect, it, vi } from 'vitest'

import { TimeShareBuffer } from '../buffer/timeShareBuffer'
import type { TimeShareData } from '../../foundation/types/price'
import type { TimeShareFetcherFn, TimeShareFetchResult } from '../legacy/types'

function point(price: number, ts = 1): TimeShareData {
  return { timestamp: ts, price, average: price, volume: 1, amount: price }
}

describe('TimeShareBuffer', () => {
  it('stores and returns preClose metadata', () => {
    const buf = new TimeShareBuffer()
    expect(buf.getPreClose()).toBeNull()
    buf.setPreClose(10.5)
    expect(buf.getPreClose()).toBe(10.5)
    buf.setPreClose(null)
    expect(buf.getPreClose()).toBeNull()
    buf.setPreClose(-1)
    expect(buf.getPreClose()).toBeNull()
  })

  it('stores the fetched preClose with its time-share points', async () => {
    const buf = new TimeShareBuffer()
    buf.setFetcher(async () => ({ data: [point(10)], preClose: 9.5 }))
    buf.load({ symbol: '000001', period: 'timeshare', source: 'gotdx' })

    await vi.waitFor(() => expect(buf.getRawData()).toHaveLength(1))
    expect(buf.getPreClose()).toBe(9.5)
    buf.dispose()
  })

  it('accepts a custom fetcher that returns a legacy point array', async () => {
    const buf = new TimeShareBuffer()
    const fetcher: TimeShareFetcherFn = async () => [point(10)]
    buf.setFetcher(fetcher)
    buf.load({ symbol: 'custom', period: 'timeshare', source: 'custom' })

    await vi.waitFor(() => expect(buf.getRawData()).toEqual([point(10)]))
    expect(buf.getPreClose()).toBeNull()
    buf.dispose()
  })

  // 验证多日请求保留按日分组数据，同时向旧渲染链路发布平铺点列。
  it('stores multi-day timeshare data by trading day and flattens its points', async () => {
    const buf = new TimeShareBuffer()
    buf.setQueryDate(20260102)
    buf.setQueryDays(2)
    buf.setRangeRequestFetch(async (_spec, date, days) => {
      expect(date).toBe(20260102)
      expect(days).toBe(2)
      return {
        requestedDays: 2,
        olderData: 'unknown',
        days: [
          { tradingDate: '2026-01-01', preClose: 9.5, data: [point(10, 1)] },
          { tradingDate: '2026-01-02', preClose: 10.5, data: [point(11, 2)] },
        ],
      }
    })
    buf.load({ symbol: '000001', period: 'timeshare', source: 'gotdx' })

    await vi.waitFor(() => expect(buf.getRawData()).toHaveLength(2))
    expect(buf.getDays()).toEqual([
      { tradingDate: '2026-01-01', preClose: 9.5, data: [point(10, 1)] },
      { tradingDate: '2026-01-02', preClose: 10.5, data: [point(11, 2)] },
    ])
    expect(buf.getPreClose()).toBe(10.5)
    buf.dispose()
  })

  it('clears previous points when a new load starts (no stale date flash)', async () => {
    const buf = new TimeShareBuffer()
    buf.setInlineData([point(10), point(11)])
    expect(buf.getRawData()).toHaveLength(2)

    let resolveFetch!: (v: TimeShareFetchResult) => void
    const pending = new Promise<TimeShareFetchResult>((resolve) => {
      resolveFetch = resolve
    })
    buf.setFetcher(async () => pending)
    buf.setQueryDate(20260101)
    buf.setPreClose(9.9)
    buf.load({ symbol: '000001', period: 'timeshare', source: 'gotdx' })

    // 新 load 开始后旧点与昨收应被清空，避免显示另一天数据
    expect(buf.getRawData()).toEqual([])
    expect(buf.getPreClose()).toBeNull()
    expect(buf.loading.peek()).toBe(true)

    resolveFetch({ data: [point(12), point(13)], preClose: 11.5 })
    await vi.waitFor(() => {
      expect(buf.getRawData()).toHaveLength(2)
    })
    expect(buf.getRawData()[0]?.price).toBe(12)
    expect(buf.getPreClose()).toBe(11.5)
    expect(buf.loading.peek()).toBe(false)
    buf.dispose()
  })

  it('passes data source params to the fetcher', async () => {
    const buf = new TimeShareBuffer()
    const fetcher = vi.fn().mockResolvedValue({ data: [point(10)], preClose: null })
    buf.setFetcher(fetcher)
    buf.load({
      symbol: '00700',
      period: 'timeshare',
      source: 'gotdx',
      params: { category: 71 },
    })

    await vi.waitFor(() => expect(fetcher).toHaveBeenCalled())

    expect(fetcher.mock.calls[0]?.[1].params).toEqual({ category: 71 })
    buf.dispose()
  })

  it('publishes the fetcher error and clears it after a successful reload', async () => {
    const buf = new TimeShareBuffer()
    // 首轮 load 会在每次失败后更新可见的重试进度。
    const fetcher = vi
      .fn<TimeShareFetcherFn>()
      .mockRejectedValueOnce(new Error('该日期暂无历史分时数据'))
      .mockRejectedValueOnce(new Error('该日期暂无历史分时数据'))
      .mockRejectedValueOnce(new Error('该日期暂无历史分时数据'))
      .mockResolvedValue({ data: [point(10)], preClose: 9.5 })
    buf.setFetcher(fetcher)

    buf.load({ symbol: '00700', period: 'timeshare', source: 'gotdx' })
    await vi.waitFor(() => expect(buf.lastError()).toBe('该日期暂无历史分时数据 Retry 1/3'))
    expect(buf.loading()).toBe(true)
    await vi.waitFor(() => expect(buf.lastError()).toBe('该日期暂无历史分时数据'), {
      timeout: 5_000,
    })

    buf.load({ symbol: '00700', period: 'timeshare', source: 'gotdx' })
    expect(buf.lastError()).toBeNull()
    await vi.waitFor(() => expect(buf.getRawData()).toEqual([point(10)]))
    expect(buf.lastError()).toBeNull()
    buf.dispose()
  })
})
