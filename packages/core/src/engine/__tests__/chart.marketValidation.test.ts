/** 使用真实 Chart 验证分时入口的市场会话与写入前校验。 */
// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { FIVE_DAY_TIME_SHARE_PERIOD, TIME_SHARE_PERIOD } from '../../controllers/types'
import { HK_MARKET_SESSION } from '../../foundation/utils/sessionTimeLabels'
import { Chart, type ChartOptions } from '../chart/index'
import { ChartDataViewId } from '../chartModel/index'
import { loadBuiltinIndicators } from '../indicators/registerBuiltins'
import { MAIN_PANE_ID } from '../pane/index'
import { createChartDom, installChartDomStubs } from './helpers/chartDomTestKit'

const options: ChartOptions = {
  yPaddingPx: 0,
  rightAxisWidth: 0,
  leftAxisWidth: 0,
  bottomAxisHeight: 24,
  minKWidth: 2,
  maxKWidth: 50,
  panes: [{ id: MAIN_PANE_ID, ratio: 1 }],
}

describe('Chart market validation boundaries', () => {
  let chart: Chart
  let restoreDom: () => void

  beforeAll(loadBuiltinIndicators)
  beforeEach(() => {
    restoreDom = installChartDomStubs()
    chart = new Chart(createChartDom(1000, 600), options)
    chart.applyCustomData({ symbol: '01810', market: 'HK', period: 'daily', data: [] })
  })
  afterEach(async () => {
    await chart.destroy()
    restoreDom()
    vi.restoreAllMocks()
  })

  it.each([
    {
      name: 'period',
      run: (target: Chart) => target.setCurrentPeriod(TIME_SHARE_PERIOD),
      view: ChartDataViewId.TimeShare,
    },
    {
      name: 'five-day period',
      run: (target: Chart) => target.setCurrentPeriod(FIVE_DAY_TIME_SHARE_PERIOD),
      view: ChartDataViewId.FiveDayTimeShare,
    },
    {
      name: 'historical date',
      run: (target: Chart) => target.switchToTimeShareForDate(20260728),
      view: ChartDataViewId.TimeShare,
    },
    {
      name: 'fetcher reset',
      run: (target: Chart) =>
        target.resetToFetcher({ ...target.symbols.peek()[0]!, period: TIME_SHARE_PERIOD }),
      view: ChartDataViewId.TimeShare,
    },
  ])('configures HK session through $name', ({ run, view }) => {
    run(chart)
    expect(chart['_timeShareMode'].marketSession).toBe(HK_MARKET_SESSION)
    expect(chart.kernel.mode.readonly.dataView.peek()).toBe(view)
  })

  it('does not resolve a session for a non-timeshare fetcher reset', () => {
    const session = vi.spyOn(chart['_timeShareMode'], 'setMarketSession')
    chart.resetToFetcher({ ...chart.symbols.peek()[0]!, market: 'FUTURES', period: 'daily' })
    expect(session).not.toHaveBeenCalled()
  })

  it('rejects unknown custom-data market before applying data', () => {
    const before = chart.symbols.peek()
    expect(() =>
      chart.applyCustomData({
        symbol: 'IF2608',
        market: 'FUTURES',
        period: TIME_SHARE_PERIOD,
        data: [],
      }),
    ).toThrow('Market session is not registered: FUTURES')
    expect(chart.symbols.peek()).toBe(before)
    expect(chart.kernel.mode.readonly.dataView.peek()).toBe(ChartDataViewId.KLine)
  })

  it('rejects timeshare input to the K-line custom-data API without changing state', () => {
    const before = chart.symbols.peek()
    expect(() =>
      chart.applyCustomData({ symbol: '01810', market: 'HK', period: TIME_SHARE_PERIOD, data: [] }),
    ).toThrow('invalid K-line period')
    expect(chart.symbols.peek()).toBe(before)
    expect(chart.kernel.mode.readonly.dataView.peek()).toBe(ChartDataViewId.KLine)
  })
})
