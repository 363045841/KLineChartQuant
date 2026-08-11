// 验证 Provider 装配器的领域映射、能力断言、时区解析与 probe 容错
import { describe, expect, it } from 'vitest'

import { createV1MarketDataProvider } from '../provider'
import type {
  MarketDataV1Transport,
  V1BarSeries,
  V1InstrumentSearchResult,
  V1TimeShareSeries,
} from '../types'
import type { InstrumentDescriptor } from '../../types'

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
function fakeTransport(overrides: Partial<MarketDataV1Transport> = {}): MarketDataV1Transport {
  return {
    probe: async () => ({ status: 'online', checkedAt: 1 }),
    searchInstruments: async (): Promise<V1InstrumentSearchResult> => ({ items: [] }),
    fetchBars: async (): Promise<V1BarSeries> => ({
      instrumentId: 'gotdx:stock:1:600519',
      period: 'daily',
      adjustment: 'none',
      timezone: 'Asia/Shanghai',
      items: [],
    }),
    fetchTimeShare: async (): Promise<V1TimeShareSeries> => ({
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
function createProvider(transport: MarketDataV1Transport) {
  return createV1MarketDataProvider({
    source: { id: 'gotdx', displayName: 'GOTDX', defaultBaseUrl: 'http://127.0.0.1:8080' },
    transport,
  })
}

describe('createV1MarketDataProvider', () => {
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
  })

  // 验证 K 线请求完成字段映射，并兜底推断 CN 非指数品种的成交量单位
  it('maps bars and falls back to lot for CN non-index instruments', async () => {
    const provider = createProvider(
      fakeTransport({
        fetchBars: async () => ({
          instrumentId: 'gotdx:stock:1:600519',
          period: 'daily',
          adjustment: 'none',
          timezone: 'Asia/Shanghai',
          items: [{ timestamp: 1, open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 }],
        }),
      }),
    )
    const series = await provider.bars!.fetch({
      instrument,
      period: 'daily',
      adjustment: 'none',
      limit: 500,
    })
    expect(series.timezone).toBe('Asia/Shanghai')
    expect(series.volumeUnit).toBe('lot')
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
          timezone: 'Asia/Shanghai',
          volumeUnit: 'share',
          items: [],
        }),
      }),
    )
    const series = await provider.bars!.fetch({
      instrument,
      period: 'daily',
      adjustment: 'none',
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
})
