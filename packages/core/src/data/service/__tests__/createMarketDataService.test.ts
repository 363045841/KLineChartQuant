/** 行情服务：共享序列、分页、刷新与释放。 */
import { afterEach, describe, expect, it } from 'vitest'
import { MarketSessionRegistry } from '@/foundation/config/marketSession/marketSessionRegistry.js'
import { systemClock } from '@/foundation/utils/clock.js'
import {
  createBuiltinMarketDataContext,
  createMockDataSource,
} from '../../provider/impl/sources/index.js'
import type { MarketDataContext } from '../../management/context.js'
import { KLineAdjustment, KLinePeriod, ORIGINAL_BAR_AGGREGATION } from '../../provider/types.js'
import { createMarketDataService, type BarsOptions, type MarketDataService } from '../index.js'

const PAGE = 50
let context: MarketDataContext | null = null
let service: MarketDataService | null = null

/** 每个用例独占宿主与服务，结束后全部释放。 */
afterEach(() => {
  service?.dispose()
  service = null
  context?.dispose()
  context = null
})

async function setup(): Promise<{
  service: MarketDataService
  spec: { instrument: Awaited<ReturnType<MarketDataContext['resolveInstrument']>>; period: string; adjust: string }
}> {
  context = createBuiltinMarketDataContext({
    // 本用例只消费 mock 源，不建立真实连接。
    fetchImpl: (input, init) => globalThis.fetch(input, init),
    openEventStream: () => {
      throw new Error('Market data service test does not open event streams')
    },
  })
  // 预览源是宿主自己的装配决定，通用装配不再内置。
  context.registerDataSource(createMockDataSource())
  service = createMarketDataService({
    registry: context.registry,
    stream: context.stream,
    marketSessions: new MarketSessionRegistry(),
    clock: systemClock,
  })
  const instrument = await context.resolveInstrument('mock', 'mock:MOCK')
  return {
    service,
    spec: { instrument, period: KLinePeriod.Daily, adjust: KLineAdjustment.None },
  }
}

describe('market data service', () => {
  it('shares one series between consumers and releases it after the last one', async () => {
    const { service: data, spec } = await setup()
    const options: BarsOptions = { aggregation: ORIGINAL_BAR_AGGREGATION, initialBars: PAGE }

    const first = data.bars(spec, options)
    const second = data.bars(spec, options)

    expect(second).toBe(first)
    await expect
      .poll(() => first.getRawData().length, { timeout: 3000 })
      .toBeGreaterThanOrEqual(PAGE)

    first.dispose()
    expect(first.getRawData().length).toBeGreaterThanOrEqual(PAGE)

    second.dispose()
    expect(first.getRawData()).toHaveLength(0)
  })

  it('prepends older bars and reports progress', async () => {
    const { service: data, spec } = await setup()
    const series = data.bars(spec, {
      aggregation: ORIGINAL_BAR_AGGREGATION,
      initialBars: PAGE,
    })
    try {
      await expect
        .poll(() => series.getRawData().length, { timeout: 3000 })
        .toBeGreaterThanOrEqual(PAGE)
      const before = series.getRawData()[0]?.timestamp

      expect(await series.loadOlder(PAGE)).toBe('covered')

      expect(series.getRawData().length).toBeGreaterThanOrEqual(PAGE * 2)
      expect(series.getRawData()[0]?.timestamp).toBeLessThan(before ?? 0)
    } finally {
      series.dispose()
    }
  })

  it('reads a page without creating a subscription', async () => {
    const { service: data, spec } = await setup()

    const page = await data.read({ spec, aggregation: ORIGINAL_BAR_AGGREGATION, limit: PAGE })

    expect(page.data).toHaveLength(PAGE)
    expect(page.timezone.length).toBeGreaterThan(0)
  })

  it('rejects an invalid period instead of guessing one', async () => {
    const { service: data, spec } = await setup()

    expect(() =>
      data.bars({ ...spec, period: 'nope' }, {
        aggregation: ORIGINAL_BAR_AGGREGATION,
        initialBars: PAGE,
      }),
    ).toThrow(/invalid K-line period/)
  })
})
