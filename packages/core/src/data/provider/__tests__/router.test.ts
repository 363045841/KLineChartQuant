/** SourceRouter 的能力流转与跨源品种解析测试。 */

import { beforeEach, describe, expect, it } from 'vitest'

import { KLineChartError } from '@/errors'
import { marketDataProviderRegistry } from '../registry'
import { SourceRouter, SourceRoutingError } from '../router'
import type { InstrumentDescriptor, MarketDataProvider } from '../types'
import { createMockMarketDataProvider } from './helpers/providerTestKit'

const baseInstrument: InstrumentDescriptor = {
  id: 'gotdx:stock:600519',
  sourceId: 'gotdx',
  symbol: '600519',
  name: '贵州茅台',
  assetClass: 'stock',
  exchange: 'SH',
  sessionId: 'CN',
  providerRef: { market: 1 },
  capabilities: { bars: { periods: ['daily'], adjustments: ['none'] } },
}

describe('SourceRouter', () => {
  beforeEach(() => {
    marketDataProviderRegistry.clear()
  })

  // 验证 auto 策略在确定性拒绝后重新搜索目标源并使用目标源私有 providerRef。
  it('flows auto requests on deterministic rejection and resolves target identity', async () => {
    const targetInstrument = {
      ...baseInstrument,
      id: 'baostock:stock:600519',
      sourceId: 'baostock',
      providerRef: { code: 'sh.600519' },
    }
    const targetSearch = async () => [targetInstrument]
    const first = createMockMarketDataProvider({
      sourceId: 'gotdx',
      fetchBars: async () => {
        throw new KLineChartError('INSTRUMENT_NOT_FOUND', 'missing')
      },
      search: async () => [],
    })
    const targetFetch = async ({
      instrument,
      limit,
      beforeTimestamp,
    }: Parameters<NonNullable<MarketDataProvider['bars']>['fetch']>[0]) => {
      expect(instrument.sourceId).toBe('baostock')
      expect(instrument.providerRef).toEqual({ code: 'sh.600519' })
      expect(limit).toBe(500)
      expect(beforeTimestamp).toBe(2)
      return {
        instrumentId: instrument.id,
        period: 'daily' as const,
        adjustment: 'none' as const,
        barAggregation: 'original' as const,
        timezone: 'Asia/Shanghai',
        data: [],
        olderData: 'unknown' as const,
      }
    }
    const second = createMockMarketDataProvider({
      sourceId: 'baostock',
      fetchBars: targetFetch,
      search: targetSearch,
    })
    marketDataProviderRegistry.register(first, { priority: 10 })
    marketDataProviderRegistry.register(second, { priority: 1 })

    const router = new SourceRouter()
    const result = await router.bars({
      preferredSourceId: 'auto',
      instrument: baseInstrument,
      symbol: baseInstrument.symbol,
      exchange: baseInstrument.exchange,
      assetClass: baseInstrument.assetClass,
      period: 'daily',
      adjustment: 'none',
      barAggregation: 'original',
      limit: 500,
      beforeTimestamp: 2,
    })

    expect(result.provider.source.id).toBe('baostock')
    expect(result.attempts).toEqual([
      { sourceId: 'gotdx', code: 'INSTRUMENT_NOT_FOUND', message: 'missing' },
    ])
  })

  // 验证显式来源即使确定性拒绝，也不得回退到其他 Provider。
  it('does not flow explicit source requests', async () => {
    let fallbackCalled = false
    const first = createMockMarketDataProvider({
      sourceId: 'gotdx',
      fetchBars: async () => {
        throw new KLineChartError('INSTRUMENT_NOT_FOUND', 'missing')
      },
      search: async () => [baseInstrument],
    })
    const second = createMockMarketDataProvider({
      sourceId: 'baostock',
      fetchBars: async () => {
        fallbackCalled = true
        return {
          instrumentId: 'baostock:stock:600519',
          period: 'daily',
          adjustment: 'none',
          barAggregation: 'original',
          timezone: 'Asia/Shanghai',
          data: [],
          olderData: 'unknown',
        }
      },
      search: async () => [{ ...baseInstrument, sourceId: 'baostock' }],
    })
    marketDataProviderRegistry.register(first, { priority: 10 })
    marketDataProviderRegistry.register(second, { priority: 1 })

    await expect(
      new SourceRouter().bars({
        preferredSourceId: 'gotdx',
        instrument: baseInstrument,
        symbol: baseInstrument.symbol,
        exchange: baseInstrument.exchange,
        period: 'daily',
        adjustment: 'none',
        barAggregation: 'original',
        limit: 500,
      }),
    ).rejects.toMatchObject({
      attempts: [{ sourceId: 'gotdx', code: 'INSTRUMENT_NOT_FOUND' }],
    })
    expect(fallbackCalled).toBe(false)
  })

  // 验证网络或上游故障不会触发下一个 Provider。
  it('does not flow on upstream failure', async () => {
    let fallbackCalled = false
    const first = createMockMarketDataProvider({
      sourceId: 'gotdx',
      fetchBars: async () => {
        throw new KLineChartError('FETCH_FAILED', 'connection refused')
      },
      search: async () => [baseInstrument],
    })
    const second = createMockMarketDataProvider({
      sourceId: 'baostock',
      fetchBars: async () => {
        fallbackCalled = true
        return {
          instrumentId: 'baostock:stock:600519',
          period: 'daily',
          adjustment: 'none',
          barAggregation: 'original',
          timezone: 'Asia/Shanghai',
          data: [],
          olderData: 'unknown',
        }
      },
      search: async () => [],
    })
    marketDataProviderRegistry.register(first, { priority: 10 })
    marketDataProviderRegistry.register(second, { priority: 1 })

    await expect(
      new SourceRouter().bars({
        preferredSourceId: 'gotdx',
        instrument: baseInstrument,
        symbol: baseInstrument.symbol,
        exchange: baseInstrument.exchange,
        period: 'daily',
        adjustment: 'none',
        barAggregation: 'original',
        limit: 500,
      }),
    ).rejects.toMatchObject({ code: 'FETCH_FAILED' })
    expect(fallbackCalled).toBe(false)
  })

  // 验证所有源拒绝时保留完整尝试链。
  it('returns the complete attempt chain when exhausted', async () => {
    const reject = async () => {
      throw new KLineChartError('UNSUPPORTED_CAPABILITY', 'unsupported')
    }
    const first = createMockMarketDataProvider({
      sourceId: 'gotdx',
      fetchBars: reject,
      search: async () => [baseInstrument],
    })
    const second = createMockMarketDataProvider({
      sourceId: 'baostock',
      fetchBars: reject,
      search: async () => [
        { ...baseInstrument, sourceId: 'baostock', id: 'baostock:stock:600519' },
      ],
    })
    marketDataProviderRegistry.register(first, { priority: 2 })
    marketDataProviderRegistry.register(second, { priority: 1 })

    const router = new SourceRouter()
    const promise = router.bars({
      symbol: baseInstrument.symbol,
      exchange: baseInstrument.exchange,
      period: 'daily',
      adjustment: 'none',
      barAggregation: 'original',
      limit: 500,
    })
    await expect(promise).rejects.toBeInstanceOf(SourceRoutingError)
    await expect(promise).rejects.toMatchObject({
      attempts: [
        { sourceId: 'gotdx', code: 'UNSUPPORTED_CAPABILITY' },
        { sourceId: 'baostock', code: 'UNSUPPORTED_CAPABILITY' },
      ],
    })
  })
})
