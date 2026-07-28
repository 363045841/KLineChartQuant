import { describe, expect, it, vi } from 'vitest'

import { Chart } from '../chart'
import { MarketSessionRegistry } from '../market/marketSessionRegistry'
import { HK_MARKET_SESSION } from '../../foundation/utils/sessionTimeLabels'

function chartHarness() {
  const timeShareMode = { setMarketSession: vi.fn() }
  return Object.assign(Object.create(Chart.prototype), {
    marketSessions: new MarketSessionRegistry(),
    _timeShareMode: timeShareMode,
    _kLineMode: {},
    setActiveMode: vi.fn(),
    dataManager: {
      symbols: {
        peek: () => [{ symbol: '01810', market: 'HK', period: 'daily' }],
      },
      addComparisonSymbol: vi.fn(),
      resetToFetcher: vi.fn(),
      applyCustomData: vi.fn(),
      setCurrentPeriod: vi.fn(),
      setTimeShareQueryDate: vi.fn(),
    },
  }) as Chart
}

describe('Chart market validation boundaries', () => {
  it('rejects an unknown comparison market before data manager mutation', () => {
    const chart = chartHarness()

    expect(() =>
      Chart.prototype.addComparisonSymbol.call(chart, {
        symbol: 'IF2608',
        market: 'FUTURES',
        period: 'daily',
      }),
    ).toThrow('Market session is not registered: FUTURES')
  })

  it('rejects an unknown reset target before fetching', () => {
    const chart = chartHarness()

    expect(() =>
      Chart.prototype.resetToFetcher.call(chart, {
        symbol: 'IF2608',
        market: 'FUTURES',
        period: 'daily',
      }),
    ).toThrow('Market session is not registered: FUTURES')
  })

  it('configures HK session when setCurrentPeriod enters timeshare', () => {
    const chart = chartHarness()

    Chart.prototype.setCurrentPeriod.call(chart, 'timeshare')

    expect((chart as any)._timeShareMode.setMarketSession).toHaveBeenCalledWith(HK_MARKET_SESSION)
  })

  it('configures HK session when switching to a historical timeshare date', () => {
    const chart = chartHarness()

    Chart.prototype.switchToTimeShareForDate.call(chart, 20260728)

    expect((chart as any)._timeShareMode.setMarketSession).toHaveBeenCalledWith(HK_MARKET_SESSION)
  })

  it('configures HK session when resetting to a timeshare fetcher', () => {
    const chart = chartHarness()

    Chart.prototype.resetToFetcher.call(chart, {
      symbol: '01810',
      market: 'HK',
      period: 'timeshare',
    })

    expect((chart as any)._timeShareMode.setMarketSession).toHaveBeenCalledWith(HK_MARKET_SESSION)
  })

  it('rejects unknown custom-data market before applying data', () => {
    const chart = chartHarness()

    expect(() =>
      Chart.prototype.applyCustomData.call(chart, {
        symbol: 'IF2608',
        market: 'FUTURES',
        period: 'timeshare',
        data: [],
      }),
    ).toThrow('Market session is not registered: FUTURES')
  })

  it('configures HK session when applying custom timeshare data', () => {
    const chart = chartHarness()

    Chart.prototype.applyCustomData.call(chart, {
      symbol: '01810',
      market: 'HK',
      period: 'timeshare',
      data: [],
    })

    expect((chart as any)._timeShareMode.setMarketSession).toHaveBeenCalledWith(HK_MARKET_SESSION)
  })
})
