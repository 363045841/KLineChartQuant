/** Deterministic chart data used only by the Electron E2E build mode. */
import type { CustomDataSource, KLineData } from '@363045841yyt/klinechart-core/controllers'

export function createE2eChartData(): CustomDataSource {
  const start = Date.parse('2026-01-01T00:00:00Z')
  const day = 86_400_000
  const data: KLineData[] = []
  let previousClose = 96

  for (let index = 0; index < 160; index += 1) {
    const drift = index * 0.22
    const wave = Math.sin(index / 5) * 3.2
    const close = Number((96 + drift + wave).toFixed(2))
    const open = previousClose
    const high = Number((Math.max(open, close) + 1.1 + (index % 4) * 0.18).toFixed(2))
    const low = Number((Math.min(open, close) - 0.9 - (index % 3) * 0.16).toFixed(2))
    data.push({
      timestamp: start + index * day,
      open,
      high,
      low,
      close,
      volume: 1_200_000 + index * 18_500 + (index % 7) * 72_000,
    })
    previousClose = close
  }

  return {
    market: 'CN',
    symbol: 'BTCUSDT',
    period: 'daily',
    adjust: 'none',
    description: 'Bitcoin / Tether E2E fixture',
    exchange: 'MOCK',
    source: 'e2e-fixture',
    data,
  }
}
