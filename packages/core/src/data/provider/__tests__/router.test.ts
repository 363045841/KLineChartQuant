/** SourceRouter 的能力流转与跨源品种解析测试。 */

import { beforeEach, describe, expect, it } from 'vitest'

import { KLineChartError } from '@/errors'
import { symbolInfoFromSpec } from '../../../engine/data/symbolInfo'
import { MarketDataProviderRegistry } from '../impl/registry'
import { SourceRouter, SourceRoutingError } from '../impl/router'
import type { InstrumentDescriptor, MarketDataProvider } from '../types'
import { InstrumentType } from '../types'
import { createMockMarketDataProvider } from './helpers/providerTestKit'

const baseInstrument: InstrumentDescriptor = {
  id: 'gotdx:stock:600519',
  source: 'gotdx',
  symbol: '600519',
  name: '贵州茅台',
  instrumentType: 'stock',
  exchange: 'SH',
  sessionId: 'CN',
  providerRef: { market: 1 },
  capabilities: { bars: { periods: ['daily'], adjustments: ['none'] } },
}

describe('SourceRouter', () => {
  /**
   * 用例独占注册表实例：内置 Provider 在模块导入时注册进生产默认单例，
   * 用例清空或改写那个单例会连带影响同一 worker 中的其它用例文件。
   */
  let registry: MarketDataProviderRegistry

  beforeEach(() => {
    registry = new MarketDataProviderRegistry()
  })

  it('resolves missing trade price precision from the catalog and preserves it in chart symbol info', async () => {
    const instrument: InstrumentDescriptor = {
      ...baseInstrument,
      tickSize: 0.01,
      lotSize: 0.00001,
      currency: 'USDT',
      capabilities: { ...baseInstrument.capabilities, trades: { raw: true, live: true } },
    }
    let catalogCalls = 0
    registry.register(
      createMockMarketDataProvider({
        source: instrument.source,
        search: async () => {
          catalogCalls++
          return [instrument]
        },
        fetchBars: async (query) => {
          expect(query.instrument.tickSize).toBe(0.01)
          return {
            instrumentId: instrument.id,
            period: 'daily',
            adjustment: 'none',
            barAggregation: 'original',
            timezone: 'UTC',
            data: [],
            olderData: 'unknown',
          }
        },
      }),
    )
    const result = await new SourceRouter(registry).bars({
      preferredSource: instrument.source,
      instrument: { ...instrument, tickSize: undefined },
      symbol: instrument.symbol,
      exchange: instrument.exchange,
      period: 'daily',
      adjustment: 'none',
      barAggregation: 'original',
      limit: 2,
    })
    expect(catalogCalls).toBe(1)
    const info = symbolInfoFromSpec({ instrument: result.instrument })
    expect(info).toMatchObject({ tickSize: 0.01, lotSize: 0.00001, currency: 'USDT' })
  })

  // 验证挂载描述已带有效 tickSize 时直接沿用，不再回权威目录重新解析。
  it('reuses the attached descriptor when it already carries a valid tickSize', async () => {
    const instrument: InstrumentDescriptor = {
      ...baseInstrument,
      tickSize: 0.01,
      lotSize: 0.00001,
      currency: 'USDT',
      capabilities: { ...baseInstrument.capabilities, trades: { raw: true, live: true } },
    }
    let catalogCalls = 0
    registry.register(
      createMockMarketDataProvider({
        source: instrument.source,
        search: async () => {
          catalogCalls++
          return [instrument]
        },
        fetchBars: async (query) => {
          expect(query.instrument).toBe(instrument)
          expect(query.instrument.tickSize).toBe(0.01)
          return {
            instrumentId: instrument.id,
            period: 'daily',
            adjustment: 'none',
            barAggregation: 'original',
            timezone: 'UTC',
            data: [],
            olderData: 'unknown',
          }
        },
      }),
    )
    const result = await new SourceRouter(registry).bars({
      preferredSource: instrument.source,
      instrument,
      symbol: instrument.symbol,
      exchange: instrument.exchange,
      period: 'daily',
      adjustment: 'none',
      barAggregation: 'original',
      limit: 2,
    })
    expect(catalogCalls).toBe(0)
    expect(result.instrument).toBe(instrument)
  })

  // 验证 auto 策略在确定性拒绝后重新搜索目标源并使用目标源私有 providerRef。
  it('flows auto requests on deterministic rejection and resolves target identity', async () => {
    const targetInstrument = {
      ...baseInstrument,
      id: 'baostock:stock:600519',
      source: 'baostock',
      providerRef: { code: 'sh.600519' },
    }
    const targetSearch = async () => [targetInstrument]
    const first = createMockMarketDataProvider({
      source: 'gotdx',
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
      expect(instrument.source).toBe('baostock')
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
      source: 'baostock',
      fetchBars: targetFetch,
      search: targetSearch,
    })
    registry.register(first, { priority: 10 })
    registry.register(second, { priority: 1 })

    const router = new SourceRouter(registry)
    const result = await router.bars({
      preferredSource: 'auto',
      instrument: baseInstrument,
      symbol: baseInstrument.symbol,
      exchange: baseInstrument.exchange,
      instrumentType: baseInstrument.instrumentType,
      period: 'daily',
      adjustment: 'none',
      barAggregation: 'original',
      limit: 500,
      beforeTimestamp: 2,
    })

    expect(result.provider.source.id).toBe('baostock')
    expect(result.attempts).toEqual([
      { source: 'gotdx', code: 'INSTRUMENT_NOT_FOUND', message: 'missing' },
    ])
  })

  // 验证显式来源即使确定性拒绝，也不得回退到其他 Provider。
  it('does not flow explicit source requests', async () => {
    let fallbackCalled = false
    const first = createMockMarketDataProvider({
      source: 'gotdx',
      fetchBars: async () => {
        throw new KLineChartError('INSTRUMENT_NOT_FOUND', 'missing')
      },
      search: async () => [baseInstrument],
    })
    const second = createMockMarketDataProvider({
      source: 'baostock',
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
      search: async () => [{ ...baseInstrument, source: 'baostock' }],
    })
    registry.register(first, { priority: 10 })
    registry.register(second, { priority: 1 })

    await expect(
      new SourceRouter(registry).bars({
        preferredSource: 'gotdx',
        instrument: baseInstrument,
        symbol: baseInstrument.symbol,
        exchange: baseInstrument.exchange,
        period: 'daily',
        adjustment: 'none',
        barAggregation: 'original',
        limit: 500,
      }),
    ).rejects.toMatchObject({
      attempts: [{ source: 'gotdx', code: 'INSTRUMENT_NOT_FOUND' }],
    })
    expect(fallbackCalled).toBe(false)
  })

  // 验证网络或上游故障不会触发下一个 Provider。
  it('does not flow on upstream failure', async () => {
    let fallbackCalled = false
    const first = createMockMarketDataProvider({
      source: 'gotdx',
      fetchBars: async () => {
        throw new KLineChartError('FETCH_FAILED', 'connection refused')
      },
      search: async () => [baseInstrument],
    })
    const second = createMockMarketDataProvider({
      source: 'baostock',
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
    registry.register(first, { priority: 10 })
    registry.register(second, { priority: 1 })

    await expect(
      new SourceRouter(registry).bars({
        preferredSource: 'gotdx',
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
      source: 'gotdx',
      fetchBars: reject,
      search: async () => [baseInstrument],
    })
    const second = createMockMarketDataProvider({
      source: 'baostock',
      fetchBars: reject,
      search: async () => [{ ...baseInstrument, source: 'baostock', id: 'baostock:stock:600519' }],
    })
    registry.register(first, { priority: 2 })
    registry.register(second, { priority: 1 })

    const router = new SourceRouter(registry)
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
        { source: 'gotdx', code: 'UNSUPPORTED_CAPABILITY' },
        { source: 'baostock', code: 'UNSUPPORTED_CAPABILITY' },
      ],
    })
  })

  // 错误码来自流转链：全源都没有该品种时报 INSTRUMENT_NOT_FOUND 而不是取数失败。
  it('derives INSTRUMENT_NOT_FOUND when every source lacks the instrument', async () => {
    for (const source of ['gotdx', 'baostock'] as const) {
      registry.register(
        createMockMarketDataProvider({
          source,
          fetchBars: async () => {
            throw new Error('should not fetch')
          },
        }),
        { priority: source === 'gotdx' ? 2 : 1 },
      )
    }

    await expect(
      new SourceRouter(registry).bars({
        symbol: '600519',
        period: 'daily',
        adjustment: 'none',
        barAggregation: 'original',
        limit: 10,
      }),
    ).rejects.toMatchObject({
      code: 'INSTRUMENT_NOT_FOUND',
      details: {
        symbol: '600519',
        attempts: [
          { source: 'gotdx', code: 'INSTRUMENT_NOT_FOUND' },
          { source: 'baostock', code: 'INSTRUMENT_NOT_FOUND' },
        ],
      },
    })
  })

  // 混合原因保留为取数失败，避免把个别源的明确拒绝误读成通用事实。
  it('falls back to FETCH_FAILED when rejections differ', async () => {
    registry.register(
      createMockMarketDataProvider({
        source: 'gotdx',
        fetchBars: async () => {
          throw new KLineChartError('UNSUPPORTED_CAPABILITY', 'unsupported')
        },
        search: async () => [baseInstrument],
      }),
      { priority: 2 },
    )
    registry.register(
      createMockMarketDataProvider({
        source: 'baostock',
        fetchBars: async () => {
          throw new Error('should not fetch')
        },
      }),
      { priority: 1 },
    )

    await expect(
      new SourceRouter(registry).bars({
        symbol: '600519',
        period: 'daily',
        adjustment: 'none',
        barAggregation: 'original',
        limit: 10,
      }),
    ).rejects.toMatchObject({ code: 'FETCH_FAILED' })
  })

  // 验证 instrumentType 为 unknown 的品种不会被源级 instrumentTypes 声明误杀，仍会发出取数请求。
  it('routes unknown instrumentType instruments instead of filtering the source out', async () => {
    const unknownInstrument: InstrumentDescriptor = {
      ...baseInstrument,
      id: 'gotdx:ex:0:HSI',
      symbol: 'HSI',
      instrumentType: 'unknown',
      exchange: 'INDEX',
    }
    let fetched = false
    const provider = createMockMarketDataProvider({
      source: 'gotdx',
      // 源声明的 instrumentTypes 不含 unknown：修复前会因此把 gotdx 整源筛掉。
      capabilities: {
        instrumentTypes: [InstrumentType.Index],
        bars: { periods: ['daily'], adjustments: ['none'] },
      },
      fetchBars: async ({ instrument }) => {
        fetched = true
        return {
          instrumentId: instrument.id,
          period: 'daily' as const,
          adjustment: 'none' as const,
          barAggregation: 'original' as const,
          timezone: 'Asia/Shanghai',
          data: [],
          olderData: 'unknown' as const,
        }
      },
    })
    registry.register(provider)

    const result = await new SourceRouter(registry).bars({
      preferredSource: 'gotdx',
      instrument: unknownInstrument,
      symbol: unknownInstrument.symbol,
      exchange: unknownInstrument.exchange,
      instrumentType: unknownInstrument.instrumentType,
      period: 'daily',
      adjustment: 'none',
      barAggregation: 'original',
      limit: 500,
    })

    expect(fetched).toBe(true)
    expect(result.provider.source.id).toBe('gotdx')
  })
})
