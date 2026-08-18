/**
 * 统一行情模型的类型契约测试。
 * 运行时断言验证模型组合，@ts-expect-error 由仓库类型检查验证非法输入。
 */

import { describe, expect, expectTypeOf, it } from 'vitest'

import type { InstrumentDescriptor as PublicInstrumentDescriptor } from '../../controllers'
import type {
  BarSeries,
  InstrumentDescriptor,
  KLinePeriod,
  MarketDataProvider,
  ProviderRef,
  TradingDate,
} from '../provider'

const stock = {
  id: 'gotdx:stock:0:000001',
  sourceId: 'gotdx',
  symbol: '000001',
  name: '平安银行',
  assetClass: 'stock',
  exchange: 'SZ',
  sessionId: 'CN',
  currency: 'CNY',
  lotSize: 100,
  providerRef: { market: 0, kind: 'stock' },
  capabilities: {
    bars: {
      periods: ['1min', 'daily', 'weekly'],
      adjustments: ['qfq', 'hfq', 'none'],
    },
    timeShare: true,
  },
} as const satisfies InstrumentDescriptor

describe('MarketData 类型契约', () => {
  // 验证品种描述可同时通过模块入口和 controllers 公共入口消费。
  it('从公共入口导出统一的品种描述', () => {
    expectTypeOf(stock).toMatchTypeOf<InstrumentDescriptor>()
    expectTypeOf(stock).toMatchTypeOf<PublicInstrumentDescriptor>()
    expect(stock.id).toBe('gotdx:stock:0:000001')
  })

  // 验证同代码品种依赖稳定 id 区分来源，而不是解析 providerRef。
  it('使用稳定 id 区分同代码的不同来源', () => {
    const fromAnotherSource = {
      ...stock,
      id: 'baostock:stock:sz:000001',
      sourceId: 'baostock',
      providerRef: { code: 'sz.000001' },
    } as const satisfies InstrumentDescriptor

    expect(fromAnotherSource.symbol).toBe(stock.symbol)
    expect(fromAnotherSource.id).not.toBe(stock.id)
  })

  // 验证 Provider 可以只组合实际支持的目录和 K 线能力。
  it('允许 Provider 按能力组合可选模块', async () => {
    const provider = {
      source: { id: 'gotdx', displayName: 'GOTDX' },
      /** 返回当前数据源探测结果。 */
      async probe() {
        return { status: 'online' as const, checkedAt: 1 }
      },
      catalog: {
        /** 返回符合查询条件的品种目录。 */
        async search() {
          return [stock]
        },
      },
      bars: {
        /** 返回标准 K 线序列。 */
        async fetch(query): Promise<BarSeries> {
          return {
            instrumentId: query.instrument.id,
            period: query.period,
            adjustment: query.adjustment,
            timezone: 'Asia/Shanghai',
            volumeUnit: 'share' as const,
            data: [],
            olderData: 'unknown',
          }
        },
      },
    } satisfies MarketDataProvider

    const result = await provider.bars.fetch({
      instrument: stock,
      period: 'daily',
      adjustment: 'qfq',
      limit: 500,
    })

    expect('timeShare' in provider).toBe(false)
    expectTypeOf(result).toMatchTypeOf<BarSeries>()
    expect(result.instrumentId).toBe(stock.id)
  })

  // 验证周期枚举不把分时模式混入 K 线周期。
  it('拒绝非标准 K 线周期', () => {
    // @ts-expect-error timeshare 是图表模式，不是 KLinePeriod
    const period: KLinePeriod = 'timeshare'
    expect(period).toBe('timeshare')
  })

  // 验证交易日必须使用带分隔符的本地日历日期。
  it('拒绝非 YYYY-MM-DD 形式的交易日', () => {
    // @ts-expect-error 交易日不得使用旧的 YYYYMMDD 数字格式
    const tradingDate: TradingDate = 20260806
    expect(tradingDate).toBe(20260806)
  })

  // 验证 Provider 私有引用只允许可序列化的基础值。
  it('拒绝 providerRef 中的嵌套对象', () => {
    // @ts-expect-error providerRef 不允许嵌套数据结构
    const providerRef: ProviderRef = { route: { market: 0 } }
    expect(providerRef).toEqual({ route: { market: 0 } })
  })
})
