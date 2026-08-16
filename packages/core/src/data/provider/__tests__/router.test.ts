/** SourceRouter 的能力流转与跨源品种解析测试。 */

import { describe, expect, it, beforeEach } from 'vitest'

import { KLineChartError } from '../../../errors'
import { marketDataProviderRegistry } from '../registry'
import { SourceRouter, SourceRoutingError } from '../router'
import type { InstrumentDescriptor, MarketDataProvider } from '../types'

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

function sourceCapabilities() {
  return {
    assetClasses: ['stock' as const],
    bars: { periods: ['daily' as const], adjustments: ['none' as const] },
  }
}

function createProvider(
  sourceId: string,
  fetchBars: NonNullable<MarketDataProvider['bars']>['fetch'],
  search: NonNullable<MarketDataProvider['catalog']>['search'],
): MarketDataProvider {
  return {
    source: { id: sourceId, displayName: sourceId, capabilities: sourceCapabilities() },
    async probe() {
      return { status: 'online', checkedAt: 1, capabilities: sourceCapabilities() }
    },
    catalog: { search },
    bars: { fetch: fetchBars },
  }
}

describe('SourceRouter', () => {
  beforeEach(() => {
    marketDataProviderRegistry.clear()
  })

  // 验证确定性拒绝会重新搜索目标源并使用目标源私有 providerRef。
  it('flows on deterministic rejection and resolves target identity', async () => {
    const targetInstrument = {
      ...baseInstrument,
      id: 'baostock:stock:600519',
      sourceId: 'baostock',
      providerRef: { code: 'sh.600519' },
    }
    const targetSearch = async () => [targetInstrument]
    const first = createProvider(
      'gotdx',
      async () => {
        throw new KLineChartError('INSTRUMENT_NOT_FOUND', 'missing')
      },
      async () => [],
    )
    const targetFetch = async ({
      instrument,
      limit,
      before,
    }: Parameters<NonNullable<MarketDataProvider['bars']>['fetch']>[0]) => {
      expect(instrument.sourceId).toBe('baostock')
      expect(instrument.providerRef).toEqual({ code: 'sh.600519' })
      expect(limit).toBe(500)
      expect(before).toBe(2)
      return {
        instrumentId: instrument.id,
        period: 'daily' as const,
        adjustment: 'none' as const,
        timezone: 'Asia/Shanghai',
        data: [],
      }
    }
    const second = createProvider('baostock', targetFetch, targetSearch)
    marketDataProviderRegistry.register(first, { priority: 10 })
    marketDataProviderRegistry.register(second, { priority: 1 })

    const router = new SourceRouter()
    const result = await router.bars({
      preferredSourceId: 'gotdx',
      instrument: baseInstrument,
      symbol: baseInstrument.symbol,
      exchange: baseInstrument.exchange,
      assetClass: baseInstrument.assetClass,
      period: 'daily',
      adjustment: 'none',
      limit: 500,
      before: 2,
    })

    expect(result.provider.source.id).toBe('baostock')
    expect(result.attempts).toEqual([
      { sourceId: 'gotdx', code: 'INSTRUMENT_NOT_FOUND', message: 'missing' },
    ])
  })

  // 验证网络或上游故障不会触发下一个 Provider。
  it('does not flow on upstream failure', async () => {
    let fallbackCalled = false
    const first = createProvider(
      'gotdx',
      async () => {
        throw new KLineChartError('FETCH_FAILED', 'connection refused')
      },
      async () => [baseInstrument],
    )
    const second = createProvider(
      'baostock',
      async () => {
        fallbackCalled = true
        return {
          instrumentId: 'baostock:stock:600519',
          period: 'daily',
          adjustment: 'none',
          timezone: 'Asia/Shanghai',
          data: [],
        }
      },
      async () => [],
    )
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
    const first = createProvider('gotdx', reject, async () => [baseInstrument])
    const second = createProvider('baostock', reject, async () => [
      { ...baseInstrument, sourceId: 'baostock', id: 'baostock:stock:600519' },
    ])
    marketDataProviderRegistry.register(first, { priority: 2 })
    marketDataProviderRegistry.register(second, { priority: 1 })

    const router = new SourceRouter()
    const promise = router.bars({
      symbol: baseInstrument.symbol,
      exchange: baseInstrument.exchange,
      period: 'daily',
      adjustment: 'none',
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

  // 验证多日分时只路由到显式声明 timeShareRange 能力的 Provider。
  it('routes timeshare ranges through the dedicated capability', async () => {
    const instrument = {
      ...baseInstrument,
      capabilities: { timeShare: true, timeShareRange: { maxTradingDays: 20 } },
    }
    const provider: MarketDataProvider = {
      source: {
        id: 'gotdx',
        displayName: 'GOTDX',
        capabilities: {
          assetClasses: ['stock'],
          timeShare: true,
          timeShareRange: { maxTradingDays: 20 },
        },
      },
      async probe() {
        return { status: 'online', checkedAt: 1 }
      },
      timeShareRange: {
        async fetch(query) {
          expect(query.endTradingDate).toBe('2026-08-06')
          expect(query.days).toBe(2)
          return {
            instrumentId: query.instrument.id,
            timezone: 'Asia/Shanghai',
            requestedDays: 2,
            days: [],
            olderData: 'unknown',
          }
        },
      },
    }
    marketDataProviderRegistry.register(provider)

    const result = await new SourceRouter().timeShareRange({
      preferredSourceId: 'gotdx',
      instrument,
      symbol: instrument.symbol,
      exchange: instrument.exchange,
      assetClass: instrument.assetClass,
      endTradingDate: '2026-08-06',
      days: 2,
    })
    expect(result.series.requestedDays).toBe(2)
  })
})
