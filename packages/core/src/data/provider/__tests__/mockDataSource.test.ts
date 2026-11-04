/** 内置 mock 沿公开注册 API 验证无限分页、页间连续性、历史稳定性、实时覆盖和宿主释放。 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LiveFrame } from '../../live/types.js'
import { createMarketDataHost } from '../../management/impl/context.js'
import { createMockDataSource } from '../impl/sources/mock.js'
import type { BarQuery } from '../types.js'

afterEach(() => vi.useRealTimers())

describe('registered mock data source', () => {
  it('serves endless pages that join at every boundary, in any fetch order', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'))
    const first = createMarketDataHost()
    const second = createMarketDataHost()
    const unregister = first.registerDataSource(createMockDataSource())
    second.registerDataSource(createMockDataSource())
    try {
      const provider = first.registry.getRequired('mock')
      const matches = await provider.catalog!.search({ keyword: 'mock', limit: 10 })
      expect(matches.map((item) => item.symbol)).toEqual(['MOCK'])
      expect(
        await provider.catalog!.search({ keyword: '', limit: 10, instrumentTypes: ['crypto'] }),
      ).toEqual([])
      expect(await first.resolveInstrument('mock', matches[0]!.id)).toEqual(matches[0])

      const query = (limit: number, beforeTimestamp?: number): BarQuery => ({
        instrument: matches[0]!,
        period: 'daily',
        adjustment: 'none',
        barAggregation: 'original',
        limit,
        ...(beforeTimestamp === undefined ? {} : { beforeTimestamp }),
      })

      const latest = await provider.bars!.fetch(query(300))
      expect(latest.data).toHaveLength(300)
      expect(latest.olderData).toBe('available')
      expect(latest.data.at(-1)?.timestamp).toBe(Date.parse('2026-06-01T00:00:00Z'))
      expect((await provider.bars!.fetch(query(300))).data).toEqual(latest.data)

      const secondPage = await provider.bars!.fetch(query(500, latest.data[0]!.timestamp))
      expect(secondPage.data).toHaveLength(500)
      expect(secondPage.olderData).toBe('available')
      expect(secondPage.data.at(-1)!.timestamp).toBeLessThan(latest.data[0]!.timestamp)
      expect(secondPage.data.at(-1)!.close).toBe(latest.data[0]!.open)

      const thirdPage = await provider.bars!.fetch(query(700, secondPage.data[0]!.timestamp))
      expect(thirdPage.data).toHaveLength(700)
      expect(thirdPage.data.at(-1)!.close).toBe(secondPage.data[0]!.open)

      // 同一页直接取和顺序取必须一致：每根 K 线只依赖自己的日索引。
      expect((await provider.bars!.fetch(query(700, secondPage.data[0]!.timestamp))).data).toEqual(
        thirdPage.data,
      )

      const instrument = matches[0]!
      const before = await provider.bars!.fetch(query(100))
      const connection = provider.realtime!({
        sourceId: 'mock',
        channel: 'bars',
        instrumentIds: [instrument.id],
        period: 'daily',
        barAggregation: 'original',
        adjustment: 'none',
      })
      const frames = vi.fn<(frame: LiveFrame) => void>()
      connection.onFrame(frames)
      connection.connect()
      await vi.advanceTimersByTimeAsync(2_000)
      const updates = frames.mock.calls.flatMap(([frame]) =>
        frame.channel === 'bars' && frame.type === 'update' ? [frame.bar] : [],
      )
      expect(updates).toHaveLength(2)
      expect(updates[1]!.timestamp).toBe(before.data.at(-1)!.timestamp)
      expect(updates[1]!.close).not.toBe(before.data.at(-1)!.close)
      const after = await provider.bars!.fetch(query(100))
      expect(after.data.slice(0, -1)).toEqual(before.data.slice(0, -1))
      expect(after.data.at(-1)!.close).toBe(updates[1]!.close)

      // 跨零点仍首尾相连：新一日的开盘等于昨日实时收盘。
      vi.setSystemTime(new Date('2026-06-02T00:00:00Z'))
      await vi.advanceTimersByTimeAsync(1_000)
      const next = await provider.bars!.fetch(query(101))
      expect(next.data).toHaveLength(101)
      expect(next.data.at(-1)!.timestamp).toBe(Date.parse('2026-06-02T00:00:00Z'))
      expect(next.data.at(-1)!.open).toBe(after.data.at(-1)!.close)

      unregister()
      const calls = frames.mock.calls.length
      await vi.advanceTimersByTimeAsync(2_000)
      expect(frames).toHaveBeenCalledTimes(calls)
      expect(vi.getTimerCount()).toBe(0)
      expect(first.registry.get('mock')).toBeUndefined()
      expect(second.registry.getRequired('mock')).not.toBe(provider)
      await expect(second.resolveInstrument('mock', instrument.id)).resolves.toMatchObject({
        id: instrument.id,
      })
      await expect(second.resolveInstrument('mock', 'unknown')).rejects.toThrow(
        'Unknown mock instrument',
      )
    } finally {
      first.dispose()
      second.dispose()
    }
  })
})
