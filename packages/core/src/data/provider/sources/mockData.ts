/** 本地 MOCK Provider 的品种目录和 K 线生成器。 */
import type { KLineData } from '../../../controllers/types'
import type { BarQuery, InstrumentDescriptor } from '../types'

/** 约一百根日 K 的本地测试品种。 */
export const MOCK_100_SYMBOL = 'MOCK-100'

/** 固定一万根日 K 的压力测试品种。 */
export const MOCK_10000_SYMBOL = 'MOCK-10000'

/** MOCK Provider 可提供的品种目录。 */
const MOCK_INSTRUMENTS: ReadonlyArray<InstrumentDescriptor> = [
  {
    id: 'mock:MOCK-100',
    sourceId: 'mock',
    symbol: MOCK_100_SYMBOL,
    name: 'Mock ~100 daily bars',
    assetClass: 'index',
    exchange: 'MOCK',
    sessionId: 'CN',
    capabilities: { bars: { periods: ['daily'], adjustments: ['none'] } },
  },
  {
    id: 'mock:MOCK-10000',
    sourceId: 'mock',
    symbol: MOCK_10000_SYMBOL,
    name: 'Mock 10,000 daily bars',
    assetClass: 'index',
    exchange: 'MOCK',
    sessionId: 'CN',
    capabilities: { bars: { periods: ['daily'], adjustments: ['none'] } },
  },
]

/** 按日步进生成指定时间范围内的随机 K 线。 */
function generateDateRangeBars(start: number, end: number): KLineData[] {
  const dayMs = 86_400_000
  const totalDays = Math.floor((end - start) / dayMs) + 1
  if (totalDays <= 0) return []

  const basePrice = 12.5
  const data: KLineData[] = []
  const rawWalk: number[] = [basePrice]
  for (let index = 1; index < totalDays; index++) {
    const previous = rawWalk[index - 1]!
    const reversion = 0.005 * (basePrice - previous)
    rawWalk.push(previous + (Math.random() - 0.48) * previous * 0.06 + reversion)
  }

  const finalOffset = rawWalk[totalDays - 1]! - basePrice
  for (let index = 0; index < totalDays; index++) {
    const close = Math.round((rawWalk[index]! - finalOffset * (index / (totalDays - 1 || 1))) * 100) / 100
    const open = index === 0 ? basePrice : data[index - 1]!.close
    const volume = Math.round(Math.random() * 10_000_000 + 1_000_000)
    data.push({
      timestamp: start + index * dayMs,
      open,
      high: Math.round(Math.max(open, close) * (1 + Math.random() * 0.03) * 100) / 100,
      low: Math.round(Math.min(open, close) * (1 - Math.random() * 0.03) * 100) / 100,
      close,
      volume,
      turnover: Math.round((volume * (open + close)) / 2),
    })
  }
  return data
}

/** 生成自 2020-01-01 起的固定一万根日 K。 */
function generateTenThousandBars(): KLineData[] {
  const start = Date.parse('2020-01-01')
  return generateDateRangeBars(start, start + 9_999 * 86_400_000)
}

/** 按关键字筛选 MOCK Provider 的标准品种目录。 */
export function searchMockInstruments(
  keyword: string,
  limit: number,
): ReadonlyArray<InstrumentDescriptor> {
  const normalizedKeyword = keyword.trim().toLowerCase()
  return MOCK_INSTRUMENTS.filter(
    (instrument) =>
      !normalizedKeyword ||
      instrument.symbol.toLowerCase().includes(normalizedKeyword) ||
      instrument.name.toLowerCase().includes(normalizedKeyword),
  ).slice(0, limit)
}

/** 根据统一 BarQuery 生成 MOCK K 线分页结果。 */
export function fetchMockBars(query: BarQuery): ReadonlyArray<KLineData> {
  if (query.instrument.symbol === MOCK_10000_SYMBOL) return generateTenThousandBars()
  const end = (query.before ?? Date.now()) - (query.before === undefined ? 0 : 1)
  return generateDateRangeBars(end - query.limit * 2 * 86_400_000, end)
    .filter((item) => query.before === undefined || item.timestamp < query.before)
    .slice(-query.limit)
}
