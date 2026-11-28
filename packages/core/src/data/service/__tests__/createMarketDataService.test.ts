/** 行情服务：共享序列、分页、刷新与释放。 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarketSessionRegistry } from '@/foundation/config/marketSession/marketSessionRegistry.js'
import { systemClock } from '@/foundation/utils/clock.js'
import {
  createMockDataSource,
} from '../../provider/impl/sources/index.js'
import { createMarketDataHost, type MarketDataContext } from '../../management/context.js'
import { KLineAdjustment, KLinePeriod, ORIGINAL_BAR_AGGREGATION } from '../../provider/types.js'
import { createMarketDataService, type BarsOptions, type MarketDataService } from '../index.js'
import { createDataSourceFixture } from '../../provider/__tests__/helpers/providerTestKit.js'

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

function startService() {
  context = createMarketDataHost()
  service = createMarketDataService({
    health: context.health, registry: context.registry, stream: context.stream,
    marketSessions: new MarketSessionRegistry(), clock: systemClock,
  })
  return { context, service }
}

async function setup(): Promise<{
  service: MarketDataService
  spec: { instrument: Awaited<ReturnType<MarketDataContext['resolveInstrument']>>; period: string; adjust: string }
}> {
  const started = startService()
  started.context.registerDataSource(createMockDataSource())
  const instrument = await started.context.resolveInstrument('mock', 'mock:MOCK')
  return {
    service: started.service,
    spec: { instrument, period: KLinePeriod.Daily, adjust: KLineAdjustment.None },
  }
}

describe('market data service', () => {
  it('keeps the realtime subscription closed until a prepared chart lease starts it', async () => {
    const { context, service } = startService()
    const bar = { timestamp: 1, open: 1, high: 2, low: 1, close: 1 }
    const fixture = createDataSourceFixture([bar])
    context.registerDataSource(fixture.source)
    const instrument = await context.resolveInstrument('test', 'A')
    const series = service.bars({ instrument, period: 'daily', adjust: 'none' }, {
      aggregation: 'original', initialBars: 1, deferLive: true,
    })

    await series.initialHistory
    expect(series.getRawData()).toEqual([bar])
    expect(fixture.streams.size).toBe(0)

    series.startLive()
    await vi.waitFor(() => expect(fixture.streams.size).toBe(1))
    series.dispose()
  })

  it('publishes upstream close timestamps and exposes live revisions through historical queries', async () => {
    const { context, service } = startService()
    const bars = [1, 2].map((timestamp) => ({ timestamp, open: 1, high: 2, low: 1, close: 1 }))
    const fixture = createDataSourceFixture(bars)
    context.registerDataSource(fixture.source)
    const spec = { instrument: await context.resolveInstrument('test', 'A'), period: 'daily', adjust: 'none' }
    const updates = vi.fn<Parameters<MarketDataService['subscribeBars']>[0]>()
    const unsubscribe = service.subscribeBars(updates)
    const series = service.bars(spec, { aggregation: 'original', initialBars: 2 })
    try {
      await vi.waitFor(() => {
        expect(fixture.streams.size).toBe(1)
        expect(series.getRawData()).toHaveLength(2)
      })
      const stream = [...fixture.streams][0]!
      stream.onFrame({ type: 'snapshot', instrumentId: 'A', seq: 1, ts: 1, bars })
      expect(updates.mock.lastCall?.[1]?.liveBarTime).toBeUndefined()
      stream.onFrame({ type: 'bar', instrumentId: 'A', seq: 2, ts: 2, state: 'closed', bar: { ...bars[0]!, close: 2 } })
      expect(updates.mock.lastCall?.[1]).toMatchObject({ liveBarTime: 1, closedBarTime: 1 })
      expect((await service.read({ spec, aggregation: 'original', limit: 2 })).data).toEqual(series.getRawData())
    } finally {
      unsubscribe()
      series.dispose()
    }
  })

  it('shares one series between consumers and releases it after the last one', async () => {
    const { service: data, spec } = await setup()
    const options: BarsOptions = { aggregation: ORIGINAL_BAR_AGGREGATION, initialBars: PAGE }

    const first = data.bars(spec, { ...options, initialBars: 2 })
    const second = data.bars(spec, options)

    expect(second.data).toBe(first.data)
    await expect
      .poll(() => first.getRawData().length, { timeout: 3000 })
      .toBeGreaterThanOrEqual(PAGE)

    first.dispose()
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

  it.each([
    ['period', { period: 'nope' }, /invalid K-line period/],
    ['adjustment', { adjust: 'nope' }, /invalid K-line adjustment/],
  ] as const)('rejects an invalid %s before acquiring a sequence', async (_field, invalid, error) => {
    const { service: data, spec } = await setup()

    expect(() =>
      data.bars({ ...spec, ...invalid }, {
        aggregation: ORIGINAL_BAR_AGGREGATION,
        initialBars: PAGE,
      }),
    ).toThrow(error)
  })
})
