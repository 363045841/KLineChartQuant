import { describe, expect, it, vi } from 'vitest'

import { TimeShareBuffer } from '../timeShareBuffer'
import type { TimeShareData } from '../../foundation/types/price'

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
  })

  it('clears previous points when a new load starts (no stale date flash)', async () => {
    const buf = new TimeShareBuffer()
    buf.setInlineData([point(10), point(11)])
    expect(buf.getRawData()).toHaveLength(2)

    let resolveFetch!: (v: ReadonlyArray<TimeShareData>) => void
    const pending = new Promise<ReadonlyArray<TimeShareData>>((resolve) => {
      resolveFetch = resolve
    })
    buf.setFetcher(async () => pending)
    buf.setQueryDate(20260101)
    buf.load({ symbol: '000001', period: 'timeshare', source: 'gotdx' })

    // 新 load 开始后旧点应被清空，避免显示另一天数据
    expect(buf.getRawData()).toEqual([])
    expect(buf.loading.peek()).toBe(true)

    resolveFetch([point(12), point(13)])
    await vi.waitFor(() => {
      expect(buf.getRawData()).toHaveLength(2)
    })
    expect(buf.getRawData()[0]?.price).toBe(12)
    expect(buf.loading.peek()).toBe(false)
    buf.dispose()
  })

  it('passes data source params to the fetcher', async () => {
    const buf = new TimeShareBuffer()
    const fetcher = vi.fn().mockResolvedValue([point(10)])
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
})
