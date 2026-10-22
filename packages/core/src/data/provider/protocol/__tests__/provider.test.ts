// 验证 Provider 装配器的领域映射、能力断言、时区解析与 probe 容错
import { describe, expect, it, vi } from 'vitest'
import type { InstrumentDescriptor } from '../../types'
import { createMarketDataProvider } from '../impl/provider'
import type {
  MarketDataTransport,
  ProtocolBarSeries,
  ProtocolInstrumentSearchResult,
  ProtocolTimeShareSeries,
} from '../types'

const instrument: InstrumentDescriptor = {
  id: 'gotdx:stock:1:600519',
  sourceId: 'gotdx',
  symbol: '600519',
  name: '贵州茅台',
  assetClass: 'stock',
  exchange: 'SH',
  sessionId: 'CN',
  providerRef: { market: 1, kind: 'stock' },
  capabilities: {
    bars: { periods: ['daily'], adjustments: ['none'] },
    timeShare: true,
  },
}

// 构造只探针的假 Transport，其余能力由各测试按需覆盖
function fakeTransport(overrides: Partial<MarketDataTransport> = {}): MarketDataTransport {
  return {
    probe: async () => ({ status: 'online', checkedAt: 1 }),
    searchInstruments: async (): Promise<ProtocolInstrumentSearchResult> => ({ items: [] }),
    fetchBars: async (): Promise<ProtocolBarSeries> => ({
      instrumentId: 'gotdx:stock:1:600519',
      period: 'daily',
      adjustment: 'none',
      barAggregation: 'original',
      timezone: 'Asia/Shanghai',
      items: [],
      olderData: 'unknown',
    }),
    fetchTimeShare: async (): Promise<ProtocolTimeShareSeries> => ({
      instrumentId: 'gotdx:stock:1:600519',
      tradingDate: '2026-08-06',
      timezone: 'Asia/Shanghai',
      preClose: 1500,
      items: [],
    }),
    ...overrides,
  }
}

// 以 GOTDX 元信息构造装配器，便于断言错误消息前缀
function createProvider(transport: MarketDataTransport) {
  return createMarketDataProvider({
    source: { id: 'gotdx', displayName: 'GOTDX', defaultBaseUrl: 'http://127.0.0.1:8080' },
    transport,
  })
}

describe('createMarketDataProvider', () => {
  // 探测更新后直接消费当前能力，不把首个响应的数字冻结为前端常量。
  it('uses a changed runtime source limit on the next request', async () => {
    let maxBarsPerRequest = 798
    const transport = fakeTransport({
      probe: async () => ({
        status: 'online',
        checkedAt: 1,
        capabilities: {
          assetClasses: ['stock'],
          bars: { periods: ['daily'], adjustments: ['none'], maxBarsPerRequest },
        },
      }),
    })
    const fetchBars = vi.spyOn(transport, 'fetchBars')
    const provider = createProvider(transport)
    for (const limit of [798, 100, 1500]) {
      maxBarsPerRequest = limit
      await provider.probe()
      await provider.bars!.fetch({
        instrument,
        period: 'daily',
        adjustment: 'none',
        barAggregation: 'original',
        limit: 3099,
      })
      expect(fetchBars).toHaveBeenLastCalledWith(expect.objectContaining({ limit }), undefined)
    }
  })

  // 大视口、缩放与旧布局均须遵守当前源声明的单页上限，不限制整批历史目标。
  it.each([
    { requested: 1, sourceLimit: 798, instrumentLimit: undefined, expected: 1 },
    { requested: 798, sourceLimit: 798, instrumentLimit: undefined, expected: 798 },
    { requested: 799, sourceLimit: 798, instrumentLimit: undefined, expected: 798 },
    { requested: 3099, sourceLimit: 798, instrumentLimit: undefined, expected: 798 },
    { requested: 5000, sourceLimit: 798, instrumentLimit: undefined, expected: 798 },
    { requested: 3099, sourceLimit: undefined, instrumentLimit: 500, expected: 500 },
    { requested: 3099, sourceLimit: 798, instrumentLimit: 200, expected: 200 },
    { requested: 3099, sourceLimit: undefined, instrumentLimit: undefined, expected: 3099 },
  ])(
    'requests $expected bars for $requested with source $sourceLimit / instrument $instrumentLimit',
    async ({ requested, sourceLimit, instrumentLimit, expected }) => {
      const transport = fakeTransport({
        probe: async () => ({
          status: 'online',
          checkedAt: 1,
          capabilities: {
            assetClasses: ['stock'],
            bars: { periods: ['daily'], adjustments: ['none'], maxBarsPerRequest: sourceLimit },
          },
        }),
      })
      const fetchBars = vi.spyOn(transport, 'fetchBars')
      const provider = createProvider(transport)
      await provider.probe()
      const signal = new AbortController().signal
      const beforeTimestamp = 1709794800000
      await provider.bars!.fetch({
        instrument: {
          ...instrument,
          capabilities: {
            ...instrument.capabilities,
            bars: { periods: ['daily'], adjustments: ['none'], maxBarsPerRequest: instrumentLimit },
          },
        },
        period: 'daily',
        adjustment: 'none',
        barAggregation: 'original',
        limit: requested,
        beforeTimestamp,
        signal,
      })
      expect(fetchBars).toHaveBeenCalledWith(
        expect.objectContaining({ limit: expected, beforeTimestamp }),
        signal,
      )
    },
  )

  // 验证探测成功时透传状态并附带耗时
  it('reports probe online with latency', async () => {
    const provider = createProvider(fakeTransport())
    await expect(provider.probe()).resolves.toMatchObject({
      status: 'online',
      checkedAt: 1,
      latencyMs: expect.any(Number),
    })
  })

  // 验证 Transport 抛错时探测回退为 offline 并保留错误消息，而非向上抛出
  it('falls back to offline when the transport probe throws', async () => {
    const provider = createProvider(
      fakeTransport({
        probe: async () => {
          throw new Error('connection refused')
        },
      }),
    )
    await expect(provider.probe()).resolves.toMatchObject({
      status: 'offline',
      message: 'connection refused',
    })
  })

  // 验证品种目录映射到领域模型，并按要求过滤 assetClasses
  it('maps catalog items and filters by asset class', async () => {
    const provider = createProvider(
      fakeTransport({
        searchInstruments: async () => ({
          items: [instrument as unknown as InstrumentDescriptor],
        }),
      }),
    )
    await expect(provider.catalog!.search({ keyword: '茅台', limit: 10 })).resolves.toEqual([
      instrument,
    ])
    await expect(
      provider.catalog!.search({ keyword: '茅台', limit: 10, assetClasses: ['index'] }),
    ).resolves.toEqual([])
    // unknown 不参与筛选：带 unknown 的请求按无条件处理，返回全部品种。
    await expect(
      provider.catalog!.search({ keyword: '茅台', limit: 10, assetClasses: ['unknown'] }),
    ).resolves.toEqual([instrument])
  })

  // 验证 K 线请求完成字段映射，并兜底推断 CN 非指数品种的成交量单位
  it('maps bars and falls back to lot for CN non-index instruments', async () => {
    const provider = createProvider(
      fakeTransport({
        fetchBars: async () => ({
          instrumentId: 'gotdx:stock:1:600519',
          period: 'daily',
          adjustment: 'none',
          barAggregation: 'original',
          timezone: 'Asia/Shanghai',
          olderData: 'unknown',
          items: [{ timestamp: 1, open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 }],
        }),
      }),
    )
    const series = await provider.bars!.fetch({
      instrument,
      period: 'daily',
      adjustment: 'none',
      barAggregation: 'original',
      limit: 500,
    })
    expect(series.timezone).toBe('Asia/Shanghai')
    expect(series.volumeUnit).toBe('lot')
    expect(series.olderData).toBe('unknown')
    expect(series.data).toEqual([
      expect.objectContaining({ symbol: '600519', close: 1.5, volume: 100 }),
    ])
  })

  // 验证 K 线请求透传自定义成交量单位规则（后端返回优先）
  it('prefers the transport volumeUnit over the local fallback', async () => {
    const provider = createProvider(
      fakeTransport({
        fetchBars: async () => ({
          instrumentId: 'gotdx:stock:1:600519',
          period: 'daily',
          adjustment: 'none',
          barAggregation: 'original',
          timezone: 'Asia/Shanghai',
          volumeUnit: 'share',
          olderData: 'exhausted',
          items: [],
        }),
      }),
    )
    const series = await provider.bars!.fetch({
      instrument,
      period: 'daily',
      adjustment: 'none',
      barAggregation: 'original',
      limit: 500,
    })
    expect(series.volumeUnit).toBe('share')
  })

  // 验证品种未声明 bars 能力时拒绝请求
  it('rejects bars when the instrument lacks the capability', async () => {
    const noBars = { ...instrument, capabilities: { timeShare: true } }
    const provider = createProvider(fakeTransport())
    await expect(
      provider.bars!.fetch({
        instrument: noBars,
        period: 'daily',
        adjustment: 'none',
        barAggregation: 'original',
        limit: 500,
      }),
    ).rejects.toThrow(/does not support bars/)
  })

  // 验证品种缺少会话标识时拒绝分时请求并给出诊断信息
  it('rejects timeShare when the instrument has no session', async () => {
    const noSession = { ...instrument, sessionId: undefined }
    const provider = createProvider(fakeTransport())
    await expect(
      provider.timeShare!.fetch({ instrument: noSession, tradingDate: '2026-08-06' }),
    ).rejects.toThrow(/sessionId is required/)
  })

  // 验证分时请求保留昨收与成交额字段并透传时区
  it('maps timeshare with preClose and amount', async () => {
    const provider = createProvider(
      fakeTransport({
        fetchTimeShare: async () => ({
          instrumentId: 'gotdx:stock:1:600519',
          tradingDate: '2026-08-06',
          timezone: 'Asia/Shanghai',
          preClose: 1500,
          items: [{ timestamp: 1, price: 1501, average: 1500.5, amount: 100 }],
        }),
      }),
    )
    const series = await provider.timeShare!.fetch({ instrument, tradingDate: '2026-08-06' })
    expect(series).toMatchObject({
      preClose: 1500,
      timezone: 'Asia/Shanghai',
      data: [expect.objectContaining({ amount: 100 })],
    })
  })

  it('maps a multi-day timeshare range when the instrument supports it', async () => {
    const rangeInstrument = {
      ...instrument,
      capabilities: { ...instrument.capabilities, timeShareRange: { maxTradingDays: 5 } },
    }
    const provider = createProvider(
      fakeTransport({
        fetchTimeShareRange: async () => ({
          instrumentId: rangeInstrument.id,
          timezone: 'Asia/Shanghai',
          requestedDays: 5,
          olderData: 'unknown',
          days: [
            {
              tradingDate: '2026-08-05',
              preClose: 1500,
              items: [{ timestamp: 1, price: 1501, average: 1500.5 }],
            },
          ],
        }),
      }),
    )

    const range = await provider.timeShareRange!.fetch({
      instrument: rangeInstrument,
      endTradingDate: '2026-08-05',
      days: 5,
    })

    expect(range).toMatchObject({
      requestedDays: 5,
      days: [
        expect.objectContaining({
          tradingDate: '2026-08-05',
          data: [expect.objectContaining({ price: 1501 })],
        }),
      ],
    })
  })
})
