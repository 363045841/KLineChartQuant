import { describe, expect, it, vi } from 'vitest'

import { Chart } from '../chart'
import { ComparisonCommands } from '../data/comparisonCommands'
import { MarketSessionRegistry } from '../market/marketSessionRegistry'
import { resolveSymbolMarketSession } from '../market/resolveSymbolMarketSession'
import { ChartDataViewId } from '../state/modeState'
import { FIVE_DAY_TIME_SHARE_PERIOD } from '../../controllers/types'
import { HK_MARKET_SESSION } from '../../foundation/utils/sessionTimeLabels'

function chartHarness() {
  const timeShareMode = { setMarketSession: vi.fn() }
  const marketSessions = new MarketSessionRegistry()
  const comparisonCommands = new ComparisonCommands({
    getSymbols: () => [{ symbol: '01810', market: 'HK', period: 'daily' }],
    commitSymbols: vi.fn(),
    setComparisonViewActive: vi.fn(),
    validateSpec: (spec) => resolveSymbolMarketSession(spec, marketSessions),
    registerSpec: vi.fn(),
    resolveInstrument: async () => ({
      instrument: null,
      searchedSourceIds: [],
      foundElsewhereSourceIds: [],
    }),
    getColor: () => undefined,
    scheduleDraw: vi.fn(),
  })
  return Object.assign(Object.create(Chart.prototype), {
    marketSessions,
    _timeShareMode: timeShareMode,
    _kLineMode: {},
    setActiveMode: vi.fn(),
    comparisonCommands,
    dataManager: {
      symbols: {
        peek: () => [{ symbol: '01810', market: 'HK', period: 'daily' }],
      },
      resetToFetcher: vi.fn(),
      applyCustomData: vi.fn(),
      setCurrentPeriod: vi.fn(),
      setTimeShareQueryDate: vi.fn(),
    },
  }) as Chart
}

describe('Chart market validation boundaries', () => {
  it('rejects an unknown comparison market before committing symbols', () => {
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

  it('enters the dedicated five-day timeshare view', () => {
    const chart = chartHarness()

    Chart.prototype.setCurrentPeriod.call(chart, FIVE_DAY_TIME_SHARE_PERIOD)

    expect((chart as any)._timeShareMode.setMarketSession).toHaveBeenCalledWith(HK_MARKET_SESSION)
    expect((chart as any).setActiveMode).toHaveBeenCalledWith(
      (chart as any)._timeShareMode,
      ChartDataViewId.FiveDayTimeShare,
    )
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
