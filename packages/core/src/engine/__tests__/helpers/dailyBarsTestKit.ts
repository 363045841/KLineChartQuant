/** 图表链路测试的日线夹具：固定天数、按游标分页，供多个用例复用。 */
import { vi } from 'vitest'
import type { SymbolSpec } from '@/data/symbolSpec.js'
import type { MarketDataProviderRegistry } from '@/data/provider/registry.js'
import {
  createTestProvider,
  instrumentFor,
  makeBarsPage,
  makeKLine,
  MS_PER_DAY,
  registerTestProvider,
} from '../../data/__tests__/helpers/chartDataManagerTestKit.js'

/** 最近 `dayCount` 天的日线夹具；分页按游标切片。 */
export function installDailySource(dayCount = 400, registry?: MarketDataProviderRegistry) {
  const end = Date.now()
  const dataset = Array.from(
    { length: dayCount },
    (_, index) => end - (dayCount - 1 - index) * MS_PER_DAY,
  )
  const fetch = vi.fn(async (query: { beforeTimestamp?: number; limit: number; instrument: { id: string } }) => {
    const eligible = dataset.filter(
        (timestamp) => query.beforeTimestamp === undefined || timestamp < query.beforeTimestamp,
    )
    return makeBarsPage(eligible.slice(-query.limit).map(makeKLine), {
      instrumentId: query.instrument.id,
      olderData: eligible.length > query.limit ? 'available' : 'exhausted',
    })
  })
  const provider = createTestProvider({ fetchBars: { fetch } })
  if (registry) registry.register(provider)
  else registerTestProvider(provider)
  return { dataset, fetch }
}

/** 日线主品种；换 symbol 可模拟序列切换。 */
export function dailySpec(symbol = 'sh.600000'): SymbolSpec {
  return { instrument: instrumentFor(symbol), period: 'daily', adjust: 'none' }
}
