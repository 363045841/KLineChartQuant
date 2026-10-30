/** 内置 mock 沿公开注册 API 验证分页、历史稳定性、增量更新和宿主释放。 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMarketDataHost } from '../../management/impl/context.js'
import { createMockDataSource } from '../impl/sources/mock.js'
import type { BarQuery } from '../types.js'
import type { LiveBarsFrame } from '../../live/types.js'

afterEach(() => vi.useRealTimers())

describe('registered mock data source', () => {
  it('provides stable cursor pages and incremental snapshots, with isolated host ownership', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'))
    const first = createMarketDataHost()
    const second = createMarketDataHost()
    const unregister = first.registerDataSource(createMockDataSource())
    second.registerDataSource(createMockDataSource())
    try {
      const provider = first.registry.getRequired('mock')
      const matches = await provider.catalog!.search({ keyword: 'mock', limit: 10 })
      expect(matches.map((item) => item.symbol)).toEqual(['MOCK-100', 'MOCK-10000'])
      expect(await provider.catalog!.search({ keyword: '', limit: 10, assetClasses: ['crypto'] })).toEqual([])
      for (const [instrument, count] of [[matches[0]!, 100], [matches[1]!, 10_000]] as const) {
        expect(await first.resolveInstrument('mock', instrument.id)).toEqual(instrument)
        const query: BarQuery = { instrument, period: 'daily', adjustment: 'none', barAggregation: 'original', limit: 30 }
        const latest = await provider.bars!.fetch(query)
        expect(latest.data).toHaveLength(30)
        expect(latest.olderData).toBe('available')
        expect(latest.data.at(-1)?.timestamp).toBe(Date.parse('2026-06-01T00:00:00Z'))
        expect((await provider.bars!.fetch(query)).data).toEqual(latest.data)
        const older = await provider.bars!.fetch({ ...query, beforeTimestamp: latest.data[0]!.timestamp, limit: count })
        expect(older.data).toHaveLength(count - latest.data.length)
        expect(older.olderData).toBe('exhausted')
        expect(older.data.at(-1)!.timestamp).toBeLessThan(latest.data[0]!.timestamp)
      }

      const instrument = matches[0]!
      const query: BarQuery = { instrument, period: 'daily', adjustment: 'none', barAggregation: 'original', limit: 100 }
      const before = await provider.bars!.fetch(query)
      const stream = provider.liveBars!.createStream({ instrumentId: instrument.id, symbol: instrument.symbol, period: query.period, adjustment: query.adjustment, barAggregation: query.barAggregation })
      const frames = vi.fn<(frame: LiveBarsFrame) => void>()
      stream.onFrame(frames)
      stream.connect()
      await vi.advanceTimersByTimeAsync(2_000)
      const updates = frames.mock.calls.map(([frame]) => frame).filter((frame) => frame.type === 'update')
      expect(updates).toHaveLength(2)
      expect(updates[1].bar.timestamp).toBe(before.data.at(-1)!.timestamp)
      expect(updates[1].bar.close).not.toBe(before.data.at(-1)!.close)
      const after = await provider.bars!.fetch(query)
      expect(after.data.slice(0, -1)).toEqual(before.data.slice(0, -1))
      expect(after.data.at(-1)).toEqual(updates[1].bar)

      vi.setSystemTime(new Date('2026-06-02T00:00:00Z'))
      await vi.advanceTimersByTimeAsync(1_000)
      expect((await provider.bars!.fetch({ ...query, limit: 101 })).data).toHaveLength(101)
      unregister()
      const calls = frames.mock.calls.length
      await vi.advanceTimersByTimeAsync(2_000)
      expect(frames).toHaveBeenCalledTimes(calls)
      expect(vi.getTimerCount()).toBe(0)
      expect(first.registry.get('mock')).toBeUndefined()
      expect(second.registry.getRequired('mock')).not.toBe(provider)
      await expect(second.resolveInstrument('mock', instrument.id)).resolves.toMatchObject({ id: instrument.id })
      await expect(second.resolveInstrument('mock', 'unknown')).rejects.toThrow('Unknown mock instrument')
    } finally {
      first.dispose()
      second.dispose()
    }
  })
})
