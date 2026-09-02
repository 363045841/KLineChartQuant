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

  // 验证 auto 策略在确定性拒绝后重新搜索目标源并使用目标源私有 providerRef。
  it('flows auto requests on deterministic rejection and resolves target identity', async () => {
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
        timezone: 'Asia/Shanghai',
        data: [],
        olderData: 'unknown' as const,
      }
    }
    const second = createProvider('baostock', targetFetch, targetSearch)
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
    const first = createProvider(
      'gotdx',
      async () => {
        throw new KLineChartError('INSTRUMENT_NOT_FOUND', 'missing')
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
          olderData: 'unknown',
        }
      },
      async () => [{ ...baseInstrument, sourceId: 'baostock' }],
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
    ).rejects.toMatchObject({
      attempts: [{ sourceId: 'gotdx', code: 'INSTRUMENT_NOT_FOUND' }],
    })
    expect(fallbackCalled).toBe(false)
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
          olderData: 'unknown',
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
})
