import type { DataFetcher, KLineData } from '../controllers/types'

export const thousandMockDataFetcher: DataFetcher = async (_source, _config) => {
  console.log('[thousand-mock] generating 10k K-lines')
  const data: KLineData[] = []
  const startTime = new Date('2020-01-01').getTime()
  const dayMs = 24 * 60 * 60 * 1000
  let lastClose = 3000
  for (let i = 0; i < 10000; i++) {
    const timestamp = startTime + i * dayMs
    const volatility = 0.02
    const trend = 0.0001
    const change = (Math.random() - 0.5) * 2 * volatility + trend
    const open = lastClose
    const close = open * (1 + change)
    const high = Math.max(open, close) * (1 + Math.random() * 0.01)
    const low = Math.min(open, close) * (1 - Math.random() * 0.01)
    const volume = Math.floor(1000000 + Math.random() * 5000000)
    data.push({
      timestamp,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume,
    })
    lastClose = close
  }
  return data
}
