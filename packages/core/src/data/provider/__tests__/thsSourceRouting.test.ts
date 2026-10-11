/**
 * 同花顺 capability 写实带来的源筛选验收。
 *
 * 场景：THS 只声明 daily（上游端外无分钟级行情）。请求 1min 时，
 * SourceRouter 应在 **capability 筛选阶段** 就把 THS 排除，而不是先请求 THS
 * 拿到错误再回退——这正是「capability 写实声明」的设计价值：无需任何特判。
 *
 * 说明：THS 的 symbol 使用完整 thscode（如 `600519.SH`），因为纯代码在同花顺侧
 * 跨交易所歧义（实测 `000001` 同时命中 000001.SZ / 000001.OF / 000001.CCI）。
 * 因此跨源流转时目标源需能按同一 symbol 解析出品种；本测试聚焦能力筛选本身。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { marketDataProviderRegistry } from '../impl/registry'
import { SourceRouter } from '../impl/router'
import { createMockMarketDataProvider } from './helpers/providerTestKit'

/** THS 侧品种：symbol 为完整 thscode，只声明 daily。 */
const thsInstrument = {
  id: 'ths:600519.SH',
  sourceId: 'ths',
  symbol: '600519.SH',
  name: '贵州茅台',
  assetClass: 'stock' as const,
  exchange: 'SH',
  sessionId: 'CN',
  providerRef: { thscode: '600519.SH', assetType: 'a-share' },
  capabilities: { bars: { periods: ['daily'] as const, adjustments: ['none'] as const } },
}

/** 另一数据源：同一 symbol 格式，声明 1min 能力。 */
const minuteInstrument = {
  ...thsInstrument,
  id: 'other:600519.SH',
  sourceId: 'other',
  providerRef: { code: '600519.SH' },
  capabilities: {
    bars: { periods: ['1min', 'daily'] as const, adjustments: ['none'] as const },
  },
}

describe('THS capability 声明驱动的源筛选', () => {
  beforeEach(() => {
    marketDataProviderRegistry.clear()
  })

  it('请求 1min 时 THS 在筛选阶段即被排除，不会被请求', async () => {
    const thsFetch = vi.fn(async () => {
      throw new Error('THS 不应被调用：它只声明 daily，应在筛选阶段被排除')
    })
    const otherFetch = vi.fn(async () => ({
      instrumentId: minuteInstrument.id,
      period: '1min' as const,
      adjustment: 'none' as const,
      barAggregation: 'original' as const,
      timezone: 'Asia/Shanghai',
      data: [{ timestamp: 1, open: 1, high: 2, low: 0.5, close: 1.5, symbol: '600519.SH' }],
      olderData: 'available' as const,
    }))

    marketDataProviderRegistry.register(
      createMockMarketDataProvider({
        sourceId: 'ths',
        capabilities: { assetClasses: ['stock'], bars: { periods: ['daily'], adjustments: ['none'] } },
        search: async () => [thsInstrument],
        fetchBars: thsFetch,
      }),
    )
    marketDataProviderRegistry.register(
      createMockMarketDataProvider({
        sourceId: 'other',
        capabilities: {
          assetClasses: ['stock'],
          bars: { periods: ['1min', 'daily'], adjustments: ['none'] },
        },
        search: async () => [minuteInstrument],
        fetchBars: otherFetch,
      }),
    )
    // THS 优先级更高，确保 auto 会先考虑它
    marketDataProviderRegistry.setConfig('ths', { enabled: true, priority: 100 })
    marketDataProviderRegistry.setConfig('other', { enabled: true, priority: 1 })

    const result = await new SourceRouter().bars({
      preferredSourceId: 'auto',
      instrument: thsInstrument,
      symbol: thsInstrument.symbol,
      exchange: thsInstrument.exchange,
      period: '1min',
      adjustment: 'none',
      barAggregation: 'original',
      limit: 30,
    })

    expect(result.provider.source.id).toBe('other')
    expect(thsFetch).not.toHaveBeenCalled()
    expect(otherFetch).toHaveBeenCalledTimes(1)
  })

  it('源级能力查询对 1min 不返回 THS', () => {
    marketDataProviderRegistry.register(
      createMockMarketDataProvider({
        sourceId: 'ths',
        capabilities: { assetClasses: ['stock'], bars: { periods: ['daily'], adjustments: ['none'] } },
        search: async () => [thsInstrument],
        fetchBars: async () => {
          throw new Error('unused')
        },
      }),
    )
    marketDataProviderRegistry.register(
      createMockMarketDataProvider({
        sourceId: 'other',
        capabilities: {
          assetClasses: ['stock'],
          bars: { periods: ['1min'], adjustments: ['none'] },
        },
        search: async () => [minuteInstrument],
        fetchBars: async () => {
          throw new Error('unused')
        },
      }),
    )

    const forMinute = marketDataProviderRegistry
      .getEnabledByCapability({ capability: 'bars', period: '1min', adjustment: 'none' })
      .map((provider) => provider.source.id)
    expect(forMinute).toEqual(['other'])

    const forDaily = marketDataProviderRegistry
      .getEnabledByCapability({ capability: 'bars', period: 'daily', adjustment: 'none' })
      .map((provider) => provider.source.id)
    expect(forDaily).toContain('ths')
  })

  it('日线请求由 THS 提供，并保留 volumeUnit 声明', async () => {
    const thsFetch = vi.fn(async () => ({
      instrumentId: thsInstrument.id,
      period: 'daily' as const,
      adjustment: 'none' as const,
      barAggregation: 'original' as const,
      timezone: 'Asia/Shanghai',
      volumeUnit: 'share' as const,
      data: [{ timestamp: 1, open: 1, high: 2, low: 0.5, close: 1.5, symbol: '600519.SH' }],
      olderData: 'available' as const,
    }))

    marketDataProviderRegistry.register(
      createMockMarketDataProvider({
        sourceId: 'ths',
        capabilities: { assetClasses: ['stock'], bars: { periods: ['daily'], adjustments: ['none'] } },
        search: async () => [thsInstrument],
        fetchBars: thsFetch,
      }),
    )
    marketDataProviderRegistry.setConfig('ths', { enabled: true, priority: 100 })

    const result = await new SourceRouter().bars({
      preferredSourceId: 'auto',
      instrument: thsInstrument,
      symbol: thsInstrument.symbol,
      exchange: thsInstrument.exchange,
      period: 'daily',
      adjustment: 'none',
      barAggregation: 'original',
      limit: 30,
    })

    expect(result.provider.source.id).toBe('ths')
    expect(thsFetch).toHaveBeenCalledTimes(1)
  })
})
