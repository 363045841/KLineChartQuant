/**
 * registered mock 数据源：目录、无限分页、实时帧与释放隔离。
 *
 * 时间用 fake timers 固定，保证分页边界与实时帧可复现。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LiveFrame } from '../../live/types.js'
import { createMarketDataHost } from '../../management/impl/context.js'
import { createMockDataSource } from '../impl/sources/mock.js'
import type { BarQuery, InstrumentDescriptor, MarketDataProvider } from '../types.js'

const MOCK_TIME = new Date('2026-06-01T12:00:00Z')
const NEXT_DAY = new Date('2026-06-02T00:00:00Z')

afterEach(() => vi.useRealTimers())

/** 建一个带 mock 源的宿主；测试结束由调用方 dispose。 */
function createHost() {
  vi.useFakeTimers()
  vi.setSystemTime(MOCK_TIME)
  const host = createMarketDataHost()
  const unregister = host.registerDataSource(createMockDataSource())
  return { host, unregister }
}

function catalogOf(provider: MarketDataProvider) {
  if (!provider.catalog) throw new Error('mock provider has no catalog')
  return provider.catalog
}

function realtimeOf(provider: MarketDataProvider) {
  if (!provider.realtime) throw new Error('mock provider has no realtime')
  return provider.realtime
}

function barsOf(provider: MarketDataProvider) {
  if (!provider.bars) throw new Error('mock provider has no bars')
  return provider.bars
}

async function resolveMock(host: ReturnType<typeof createMarketDataHost>) {
  const provider = host.registry.getRequired('mock')
  const matches = await catalogOf(provider).search({ keyword: 'mock', limit: 10 })
  return { provider, instrument: matches[0]! }
}

function barQuery(
  instrument: InstrumentDescriptor,
  limit: number,
  beforeTimestamp?: number,
): BarQuery {
  return {
    instrument,
    period: 'daily',
    adjustment: 'none',
    barAggregation: 'original',
    limit,
    ...(beforeTimestamp === undefined ? {} : { beforeTimestamp }),
  }
}

describe('mock 数据源目录', () => {
  it('只匹配 mock，按品种类型过滤，并能解析已搜索到的品种', async () => {
    const { host } = createHost()
    try {
      const { provider, instrument } = await resolveMock(host)

      await expect(
        catalogOf(provider).search({ keyword: 'mock', limit: 10 }),
      ).resolves.toMatchObject([{ symbol: 'MOCK' }])
      await expect(
        catalogOf(provider).search({ keyword: '', limit: 10, instrumentTypes: ['crypto'] }),
      ).resolves.toEqual([])
      await expect(host.resolveInstrument('mock', instrument.id)).resolves.toEqual(instrument)
    } finally {
      host.dispose()
    }
  })
})

describe('mock 数据源分页', () => {
  it('无限分页在边界处首尾相接，且与取数顺序无关', async () => {
    const { host } = createHost()
    try {
      const { provider, instrument } = await resolveMock(host)
      const bars = barsOf(provider)

      const latest = await bars.fetch(barQuery(instrument, 300))
      expect(latest.data).toHaveLength(300)
      expect(latest.olderData).toBe('available')
      expect(latest.data.at(-1)?.timestamp).toBe(Date.parse('2026-06-01T00:00:00Z'))
      expect((await bars.fetch(barQuery(instrument, 300))).data).toEqual(latest.data)

      const secondPage = await bars.fetch(barQuery(instrument, 500, latest.data[0]!.timestamp))
      expect(secondPage.data).toHaveLength(500)
      expect(secondPage.olderData).toBe('available')
      expect(secondPage.data.at(-1)!.timestamp).toBeLessThan(latest.data[0]!.timestamp)
      expect(secondPage.data.at(-1)!.close).toBe(latest.data[0]!.open)

      const thirdPage = await bars.fetch(barQuery(instrument, 700, secondPage.data[0]!.timestamp))
      expect(thirdPage.data).toHaveLength(700)
      expect(thirdPage.data.at(-1)!.close).toBe(secondPage.data[0]!.open)

      const again = await bars.fetch(barQuery(instrument, 700, secondPage.data[0]!.timestamp))
      expect(again.data).toEqual(thirdPage.data)
    } finally {
      host.dispose()
    }
  })
})

describe('mock 数据源实时帧', () => {
  it('覆盖最后一根 K 线，并在次日零点生成新 K 线', async () => {
    const { host } = createHost()
    try {
      const { provider, instrument } = await resolveMock(host)
      const bars = barsOf(provider)
      const before = await bars.fetch(barQuery(instrument, 100))

      const connection = realtimeOf(provider)({
        source: 'mock',
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

      const after = await bars.fetch(barQuery(instrument, 100))
      expect(after.data.slice(0, -1)).toEqual(before.data.slice(0, -1))
      expect(after.data.at(-1)!.close).toBe(updates[1]!.close)

      vi.setSystemTime(NEXT_DAY)
      await vi.advanceTimersByTimeAsync(1_000)
      const next = await bars.fetch(barQuery(instrument, 101))
      expect(next.data).toHaveLength(101)
      expect(next.data.at(-1)!.timestamp).toBe(Date.parse('2026-06-02T00:00:00Z'))
      expect(next.data.at(-1)!.open).toBe(after.data.at(-1)!.close)
    } finally {
      host.dispose()
    }
  })
})

describe('mock 数据源释放隔离', () => {
  it('注销后停止推送并清空定时器，且不影响另一个宿主', async () => {
    const first = createHost()
    const second = createHost()
    try {
      const firstMock = await resolveMock(first.host)
      const { instrument } = firstMock
      const connection = realtimeOf(firstMock.provider)({
        source: 'mock',
        channel: 'bars',
        instrumentIds: [instrument.id],
        period: 'daily',
        barAggregation: 'original',
        adjustment: 'none',
      })
      const frames = vi.fn<(frame: LiveFrame) => void>()
      connection.onFrame(frames)
      connection.connect()
      await vi.advanceTimersByTimeAsync(1_000)

      first.unregister()
      const calls = frames.mock.calls.length
      await vi.advanceTimersByTimeAsync(2_000)

      expect(frames).toHaveBeenCalledTimes(calls)
      expect(vi.getTimerCount()).toBe(0)
      expect(first.host.registry.get('mock')).toBeUndefined()

      const secondProvider = second.host.registry.getRequired('mock')
      expect(secondProvider).not.toBe(firstMock.provider)
      await expect(second.host.resolveInstrument('mock', instrument.id)).resolves.toMatchObject({
        id: instrument.id,
      })
      await expect(second.host.resolveInstrument('mock', 'unknown')).rejects.toThrow(
        'Unknown mock instrument',
      )
    } finally {
      first.host.dispose()
      second.host.dispose()
    }
  })
})
