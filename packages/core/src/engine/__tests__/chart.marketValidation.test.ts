import { describe, expect, it, vi } from 'vitest'
import { FIVE_DAY_TIME_SHARE_PERIOD } from '../../controllers/types'
import { HK_MARKET_SESSION } from '../../foundation/utils/sessionTimeLabels'
import { Chart } from '../chart'
import { MarketSessionRegistry } from '../market/marketSessionRegistry'
import { ChartDataViewId } from '../state/modeState'

/** 分时会话被写入的替身，断言其 setMarketSession 调用。 */
type TimeShareSessionSpy = { setMarketSession: ReturnType<typeof vi.fn> }

/** 构造只覆盖会话解析所需字段的 Chart 实例。 */
function chartHarness() {
  const timeShareMode: TimeShareSessionSpy = { setMarketSession: vi.fn() }
  return {
    chart: Object.assign(Object.create(Chart.prototype), {
      marketSessions: new MarketSessionRegistry(),
      _timeShareMode: timeShareMode,
      _kLineMode: {},
      setActiveMode: vi.fn(),
      dataManager: {
        symbols: {
          peek: () => [{ symbol: '01810', market: 'HK', period: 'daily' }],
        },
        applyCustomData: vi.fn(),
        resetToFetcher: vi.fn(),
        setCurrentPeriod: vi.fn(),
        setTimeShareQueryDate: vi.fn(),
      },
    }) as Chart,
    timeShareMode,
  }
}

describe('Chart market validation boundaries', () => {
  it('configures HK session when setCurrentPeriod enters timeshare', () => {
    const { chart, timeShareMode } = chartHarness()

    Chart.prototype.setCurrentPeriod.call(chart, 'timeshare')

    expect(timeShareMode.setMarketSession).toHaveBeenCalledWith(HK_MARKET_SESSION)
  })

  it('enters the dedicated five-day timeshare view', () => {
    const { chart, timeShareMode } = chartHarness()

    Chart.prototype.setCurrentPeriod.call(chart, FIVE_DAY_TIME_SHARE_PERIOD)

    expect(timeShareMode.setMarketSession).toHaveBeenCalledWith(HK_MARKET_SESSION)
    expect(chart.setActiveMode).toHaveBeenCalledWith(
      timeShareMode,
      ChartDataViewId.FiveDayTimeShare,
    )
  })

  it('configures HK session when switching to a historical timeshare date', () => {
    const { chart, timeShareMode } = chartHarness()

    Chart.prototype.switchToTimeShareForDate.call(chart, 20260728)

    expect(timeShareMode.setMarketSession).toHaveBeenCalledWith(HK_MARKET_SESSION)
  })

  it('configures HK session when resetting to a timeshare fetcher', () => {
    const { chart, timeShareMode } = chartHarness()

    Chart.prototype.resetToFetcher.call(chart, {
      symbol: '01810',
      market: 'HK',
      period: 'timeshare',
    })

    expect(timeShareMode.setMarketSession).toHaveBeenCalledWith(HK_MARKET_SESSION)
  })

  it('does not resolve a session for a non-timeshare fetcher reset', () => {
    const { chart, timeShareMode } = chartHarness()

    expect(() =>
      Chart.prototype.resetToFetcher.call(chart, {
        symbol: 'IF2608',
        market: 'FUTURES',
        period: 'daily',
      }),
    ).not.toThrow()
    expect(timeShareMode.setMarketSession).not.toHaveBeenCalled()
  })

  it('rejects unknown custom-data market before applying data', () => {
    const { chart } = chartHarness()

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
    const { chart, timeShareMode } = chartHarness()

    Chart.prototype.applyCustomData.call(chart, {
      symbol: '01810',
      market: 'HK',
      period: 'timeshare',
      data: [],
    })

    expect(timeShareMode.setMarketSession).toHaveBeenCalledWith(HK_MARKET_SESSION)
  })
})
