import { describe, expect, it, vi } from 'vitest'

import { TimeShareBuffer } from '../buffer/timeShareBuffer'
import type { TimeShareData } from '../../foundation/types/price'
import type { TimeShareFetcherFn, TimeShareFetchResult } from '../legacy/types'
import type { TimeShareRange } from '../provider/types'

function point(price: number, ts = 1): TimeShareData {
  return { timestamp: ts, price, average: price, volume: 1, amount: price }
}

describe('TimeShareBuffer', () => {
  it('stores a grouped range and uses the latest daily preClose', () => {
    const buf = new TimeShareBuffer()
    const range: TimeShareRange = {
      instrumentId: 'gotdx:stock:1:600519',
      timezone: 'Asia/Shanghai',
      requestedDays: 2,
      olderData: 'unknown',
      days: [
        { tradingDate: '2026-08-05', preClose: 9, data: [point(10, 1)] },
        { tradingDate: '2026-08-06', preClose: 10, data: [point(11, 2)] },
      ],
    }

    buf.setRange(range)

    expect(buf.getRange()?.days).toHaveLength(2)
    expect(buf.getRawData()).toEqual([point(10, 1), point(11, 2)])
    expect(buf.getPreClose()).toBe(10)
  })

  it('publishes range data and preClose from one content snapshot', () => {
    const buf = new TimeShareBuffer()
    const changes: Array<{ data: number; range: number; preClose: number | null }> = []
    buf.data.subscribe(() => {
      changes.push({
        data: buf.data.peek().data.length,
        range: buf.range.peek()?.days.length ?? 0,
        preClose: buf.getPreClose(),
      })
    })

    buf.setRange({
      instrumentId: 'gotdx:stock:1:600519',
      timezone: 'Asia/Shanghai',
      requestedDays: 1,
      olderData: 'unknown',
      days: [{ tradingDate: '2026-08-06', preClose: 10, data: [point(11)] }],
    })

    expect(changes).toEqual([{ data: 1, range: 1, preClose: 10 }])
  })

  it('stores and returns preClose metadata', () => {
    const buf = new TimeShareBuffer()
    expect(buf.getPreClose()).toBeNull()
    buf.setInlineData([point(10)], 10.5)
    expect(buf.getPreClose()).toBe(10.5)
    buf.setInlineData([point(11)], null)
    expect(buf.getPreClose()).toBeNull()
    buf.setInlineData([point(12)], -1)
    expect(buf.getPreClose()).toBeNull()
  })

  it('does not carry range preClose into inline data', () => {
    const buf = new TimeShareBuffer()
    buf.setRange({
      instrumentId: 'gotdx:stock:1:600519',
      timezone: 'Asia/Shanghai',
      requestedDays: 1,
      olderData: 'unknown',
      days: [{ tradingDate: '2026-08-06', preClose: 10, data: [point(11)] }],
    })

    buf.setInlineData([point(12)], null)

    expect(buf.getPreClose()).toBeNull()
    expect(buf.getRange()).toBeNull()
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

  it('clears previous points when a new load starts (no stale date flash)', async () => {
    const buf = new TimeShareBuffer()
    buf.setInlineData([point(10), point(11)], null)
    expect(buf.getRawData()).toHaveLength(2)

    let resolveFetch!: (v: TimeShareFetchResult) => void
    const pending = new Promise<TimeShareFetchResult>((resolve) => {
      resolveFetch = resolve
    })
    buf.setFetcher(async () => pending)
    buf.setQueryDate(20260101)
    buf.setInlineData([point(10), point(11)], 9.9)
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
