/** MarketDataProvider 到旧 Fetcher API 的兼容适配测试。 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { InstrumentDescriptor, MarketDataProvider } from '../provider'
import { createLegacyMarketDataAdapters } from '../provider'

const instrument = {
  id: 'gotdx:stock:0:000001',
  sourceId: 'gotdx',
  symbol: '000001',
  name: '平安银行',
  assetClass: 'stock',
  exchange: 'SZ',
  sessionId: 'CN',
  providerRef: { market: 0, kind: 'stock' },
  capabilities: {
    bars: { periods: ['daily'], adjustments: ['qfq', 'none'] },
    timeShare: true,
  },
} as const satisfies InstrumentDescriptor

describe('createLegacyMarketDataAdapters', () => {
  const barsFetch = vi.fn()
  const catalogSearch = vi.fn()
  const timeShareFetch = vi.fn()
  const resolveInstrument = vi.fn()

  const provider = {
    source: { id: 'gotdx', displayName: 'GOTDX' },
    /** 返回固定在线状态，避免测试依赖网络。 */
    async probe() {
      return { status: 'online' as const, checkedAt: 1 }
    },
    catalog: { search: catalogSearch },
    bars: { fetch: barsFetch },
    timeShare: { fetch: timeShareFetch },
  } satisfies MarketDataProvider

  beforeEach(() => {
    vi.clearAllMocks()
    resolveInstrument.mockResolvedValue(instrument)
    barsFetch.mockResolvedValue({
      instrumentId: instrument.id,
      period: 'daily',
      adjustment: 'qfq',
      timezone: 'Asia/Shanghai',
      volumeUnit: 'share',
      data: [{ timestamp: 1, open: 1, high: 2, low: 1, close: 2 }],
    })
    catalogSearch.mockResolvedValue([instrument])
    timeShareFetch.mockResolvedValue({
      instrumentId: instrument.id,
      tradingDate: '2026-08-06',
      timezone: 'Asia/Shanghai',
      preClose: 10,
      volumeUnit: 'share',
      data: [{ timestamp: 1, price: 11, average: 10.5 }],
    })
  })

  // 验证旧 K 线配置被转换为 Provider 查询，并只返回 data。
  it('适配 K 线请求和结果', async () => {
    const adapters = createLegacyMarketDataAdapters(provider, { resolveInstrument })
    const result = await adapters.fetcher!('gotdx', {
      symbol: '000001',
      startDate: '2026-08-01',
      endDate: '2026-08-06',
      period: 'daily',
      adjust: 'qfq',
      exchange: 'SZ',
      params: { market: 0, kind: 'stock' },
    })

    expect(resolveInstrument).toHaveBeenCalledWith({
      capability: 'bars',
      sourceId: 'gotdx',
      config: expect.objectContaining({ symbol: '000001' }),
    })
    expect(barsFetch).toHaveBeenCalledWith({
      instrument,
      period: 'daily',
      adjustment: 'qfq',
      from: Date.parse('2026-08-01'),
      to: Date.parse('2026-08-06'),
    })
    expect(result).toEqual([{ timestamp: 1, open: 1, high: 2, low: 1, close: 2 }])
  })

  // 验证目录结果降级为旧 SearchResult，providerRef 保持原样。
  it('适配品种搜索请求和结果', async () => {
    const adapters = createLegacyMarketDataAdapters(provider, { resolveInstrument })
    const result = await adapters.searcher!('gotdx', { query: '000001' })

    expect(catalogSearch).toHaveBeenCalledWith({
      keyword: '000001',
      limit: 20,
      signal: undefined,
    })
    expect(result).toEqual([
      {
        id: instrument.id,
        assetClass: 'stock',
        sessionId: 'CN',
        capabilities: instrument.capabilities,
        symbol: '000001',
        description: '平安银行',
        exchange: 'SZ',
        market: 'CN',
        source: 'gotdx',
        params: instrument.providerRef,
      },
    ])
  })

  // 验证旧 YYYYMMDD 分时日期转换为标准交易日。
  it('适配分时请求和结果', async () => {
    const adapters = createLegacyMarketDataAdapters(provider, { resolveInstrument })
    const result = await adapters.timeShareFetcher!('gotdx', {
      symbol: '000001',
      date: 20260806,
      params: { market: 0, kind: 'stock' },
    })

    expect(timeShareFetch).toHaveBeenCalledWith({
      instrument,
      tradingDate: '2026-08-06',
    })
    expect(result).toEqual({
      data: [{ timestamp: 1, price: 11, average: 10.5 }],
      preClose: 10,
    })
  })

  // 验证不支持的 Provider 模块不会生成对应旧 Fetcher。
  it('仅暴露 Provider 实际支持的能力', () => {
    const probeOnly = {
      source: { id: 'probe', displayName: 'Probe' },
      /** 返回固定离线状态。 */
      async probe() {
        return { status: 'offline' as const, checkedAt: 1 }
      },
    } satisfies MarketDataProvider

    expect(createLegacyMarketDataAdapters(probeOnly, { resolveInstrument })).toEqual({
      fetcher: undefined,
      searcher: undefined,
      timeShareFetcher: undefined,
    })
  })

  // 验证错误 source、非法周期和反向日期区间在调用 Provider 前失败。
  it('拒绝非法旧 K 线请求', async () => {
    const adapters = createLegacyMarketDataAdapters(provider, { resolveInstrument })
    const config = {
      symbol: '000001',
      startDate: '2026-08-06',
      endDate: '2026-08-01',
      period: 'timeshare',
      adjust: 'none',
    }

    await expect(adapters.fetcher!('other', config)).rejects.toThrow(/expected source/)
    await expect(adapters.fetcher!('gotdx', config)).rejects.toThrow(/startDate must not be after/)
    expect(barsFetch).not.toHaveBeenCalled()
  })

  // 验证 resolver 返回其他代码时不会向 Provider 发出错误请求。
  it('拒绝 resolver 返回不匹配的品种', async () => {
    resolveInstrument.mockResolvedValue({ ...instrument, symbol: '000002' })
    const adapters = createLegacyMarketDataAdapters(provider, { resolveInstrument })

    await expect(
      adapters.fetcher!('gotdx', {
        symbol: '000001',
        startDate: '2026-08-01',
        endDate: '2026-08-06',
        period: 'daily',
        adjust: 'none',
      }),
    ).rejects.toThrow(/mismatched instrument/)
    expect(barsFetch).not.toHaveBeenCalled()
  })

  // 验证非法 YYYYMMDD 不会进入 Provider 分时模块。
  it('拒绝非法分时交易日', async () => {
    const adapters = createLegacyMarketDataAdapters(provider, { resolveInstrument })

    await expect(
      adapters.timeShareFetcher!('gotdx', {
        symbol: '000001',
        date: 20260230,
      }),
    ).rejects.toThrow(/invalid trading date/)
    expect(timeShareFetch).not.toHaveBeenCalled()
  })
})
