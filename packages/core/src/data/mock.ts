/**
 * 统一 MOCK 数据源
 * 将原先的 mock-100 / mock-10000 两个源合并为单一 'mock' 源，
 * 按品种名（MOCK-100 / MOCK-10000）分发生成不同规模的 K 线。
 * 数据本地生成、不依赖后端，因此探测（probe）恒为在线。
 */
import type { KLineData } from '../controllers/types'

import { DataFetcher } from './fetcherDefinitionRegistry'
import type { FetchConfig, SearchConfig, SearchResult } from './types'

/** MOCK-100 品种：按请求日期范围生成日 K */
export const MOCK_100_SYMBOL = 'MOCK-100'

/** MOCK-10000 品种：固定生成 10000 根日 K，忽略日期范围 */
export const MOCK_10000_SYMBOL = 'MOCK-10000'

/** MOCK 源拥有的全部品种（搜索与探测均返回此列表） */
const MOCK_VARIETIES: ReadonlyArray<SearchResult> = [
  {
    symbol: MOCK_100_SYMBOL,
    description: 'Mock ~100 daily bars',
    exchange: 'MOCK',
    market: 'CN',
    source: 'mock',
  },
  {
    symbol: MOCK_10000_SYMBOL,
    description: 'Mock 10,000 daily bars',
    exchange: 'MOCK',
    market: 'CN',
    source: 'mock',
  },
]

/**
 * 按日步进生成 [start, end] 范围内的随机 K 线，Brownian bridge 保证首尾对齐
 * @param start - 起始时间戳
 * @param end - 结束时间戳
 */
function generateDateRangeBars(start: number, end: number): KLineData[] {
  const dayMs = 86400000
  const totalDays = Math.floor((end - start) / dayMs) + 1
  if (totalDays <= 0) return []

  const basePrice = 12.5
  const data: KLineData[] = []

  if (totalDays === 1) {
    data.push({
      timestamp: start,
      open: basePrice,
      high: basePrice,
      low: basePrice,
      close: basePrice,
      volume: Math.round(Math.random() * 10000000 + 1000000),
    })
    return data
  }

  const meanReversionStrength = 0.005

  const rawWalk: number[] = [basePrice]
  for (let i = 1; i < totalDays; i++) {
    const prev = rawWalk[i - 1]!
    const reversion = meanReversionStrength * (basePrice - prev)
    const change = (Math.random() - 0.48) * prev * 0.06 + reversion
    rawWalk.push(prev + change)
  }

  const finalOffset = rawWalk[totalDays - 1]! - basePrice
  for (let i = 0; i < totalDays; i++) {
    const bridge = finalOffset * (i / (totalDays - 1))
    const close = Math.round((rawWalk[i]! - bridge) * 100) / 100

    const ts = start + i * dayMs
    const open = i === 0 ? basePrice : data[i - 1]!.close

    const high = Math.round(Math.max(open, close) * (1 + Math.random() * 0.03) * 100) / 100
    const low = Math.round(Math.min(open, close) * (1 - Math.random() * 0.03) * 100) / 100
    const volume = Math.round(Math.random() * 10000000 + 1000000)
    data.push({
      timestamp: ts,
      open,
      high,
      low,
      close,
      volume,
      turnover: Math.round((volume * (open + close)) / 2),
    })
  }

  return data
}

/**
 * 固定生成 10000 根日 K，自 2020-01-01 起
 */
function generateTenThousandBars(): KLineData[] {
  const data: KLineData[] = []
  const startTime = new Date('2020-01-01').getTime()
  const dayMs = 24 * 60 * 60 * 1000
  const totalDays = 10000

  const basePrice = 3000
  const meanReversionStrength = 0.0005
  const volatility = 0.02

  const rawWalk: number[] = [basePrice]
  for (let i = 1; i < totalDays; i++) {
    const prev = rawWalk[i - 1]!
    const reversion = meanReversionStrength * (basePrice - prev)
    const change = (Math.random() - 0.5) * 2 * volatility * prev + reversion
    rawWalk.push(prev + change)
  }

  const finalOffset = rawWalk[totalDays - 1]! - basePrice
  for (let i = 0; i < totalDays; i++) {
    const bridge = finalOffset * (i / (totalDays - 1))
    const close = Math.round((rawWalk[i]! - bridge) * 100) / 100

    const timestamp = startTime + i * dayMs
    const open = i === 0 ? basePrice : data[i - 1]!.close

    const high = Math.round(Math.max(open, close) * (1 + Math.random() * 0.01) * 100) / 100
    const low = Math.round(Math.min(open, close) * (1 - Math.random() * 0.01) * 100) / 100
    const volume = Math.floor(1000000 + Math.random() * 5000000)
    data.push({
      timestamp,
      open,
      high,
      low,
      close,
      volume,
    })
  }

  return data
}

/**
 * MOCK 源 K 线拉取：按品种分发，MOCK-10000 固定 10k 根，其余按日期范围生成
 * @param _source - 注册名（固定为 'mock'，未使用）
 * @param config - 统一 FetchConfig 契约
 */
async function fetchMock(_source: string, config: FetchConfig): Promise<ReadonlyArray<KLineData>> {
  console.log(`[mock] generating ${config.symbol} ${config.period}`)
  if (config.symbol === MOCK_10000_SYMBOL) {
    return generateTenThousandBars()
  }
  const start = new Date(config.startDate).getTime()
  const end = new Date(config.endDate).getTime()
  return generateDateRangeBars(start, end)
}

/**
 * MOCK 源搜索：返回拥有的两个品种，本地同步完成且永远成功（探测恒为在线）
 * @param _source - 注册名（未使用）
 * @param config - 统一 SearchConfig 契约
 */
async function searchMock(
  _source: string,
  config: SearchConfig,
): Promise<ReadonlyArray<SearchResult>> {
  const query = config.query.trim().toLowerCase()
  const matched = MOCK_VARIETIES.filter(
    (item) =>
      !query ||
      item.symbol.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query),
  )
  return config.limit === undefined ? matched : matched.slice(0, config.limit)
}

@DataFetcher({
  name: 'mock',
  displayName: 'Mock',
  description: 'Local mock source with MOCK-100 / MOCK-10000 varieties, no backend needed',
  version: '1.0.0',
  capabilities: ['*', 'search'],
})
class MockFetcher {
  static fetcher = fetchMock
  static searcher = searchMock
}

/** 统一 MOCK 数据源拉取函数（可直接用作 dataFetcher，或经 routerDataFetcher 按名调用） */
export const mockDataFetcher = fetchMock

/** @deprecated 已合并到 'mock' 源；直接调用时按品种名分发 */
export const hundredMockDataFetcher = fetchMock

/** @deprecated 已合并到 'mock' 源；MOCK-10000 仍固定生成 10k 根 */
export const thousandMockDataFetcher = fetchMock
