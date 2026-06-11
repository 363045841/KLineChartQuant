import type { DataFetcher, KLineData } from '../controllers/types'

export const hundredMockDataFetcher: DataFetcher = async (_source, config) => {
  console.log(`[hundred-mock] generating ${config.symbol} ${config.period}`)
  const start = new Date(config.startDate).getTime()
  const end = new Date(config.endDate).getTime()
  const dayMs = 86400000
  const totalDays = Math.floor((end - start) / dayMs) + 1
  const data: KLineData[] = []
  let price = 10 + Math.random() * 5
  for (let i = 0; i < totalDays; i++) {
    const ts = start + i * dayMs
    const change = (Math.random() - 0.48) * price * 0.06
    const open = price
    const close = Math.round((open + change) * 100) / 100
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
    price = close
  }
  return data
}
