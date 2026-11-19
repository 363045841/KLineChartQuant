/** 使用真实 Chart 验证分时入口的市场会话与写入前校验。 */
// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { FIVE_DAY_TIME_SHARE_PERIOD, TIME_SHARE_PERIOD } from '../../controllers/types'
import { HK_MARKET_SESSION } from '../../foundation/utils/sessionTimeLabels'
import { Chart, type ChartOptions } from '../chart/index'
import { ChartDataViewId } from '../chartModel/index'
import { loadBuiltinIndicators } from '../indicators/registerBuiltins'
import { MAIN_PANE_ID } from '../pane/types'
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
    chart.setSymbols([{ symbol: '01810', market: 'HK', period: 'daily', source: 'session-fixture', incremental: false }])
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
      name: 'symbol selection',
      run: (target: Chart) =>
        target.setSymbols([{ ...target.symbols.peek()[0]!, period: TIME_SHARE_PERIOD }]),
      view: ChartDataViewId.TimeShare,
    },
  ])('configures HK session through $name', ({ run, view }) => {
    run(chart)
    expect(chart['_timeShareMode'].marketSession).toEqual(HK_MARKET_SESSION)
    expect(chart.kernel.mode.readonly.dataView.peek()).toBe(view)
  })

  it('does not resolve a session for a non-timeshare selection', () => {
    const session = vi.spyOn(chart['_timeShareMode'], 'setMarketSession')
    chart.setSymbols([{ ...chart.symbols.peek()[0]!, market: 'FUTURES', period: 'daily' }])
    expect(session).not.toHaveBeenCalled()
  })

  it('rejects unknown timeshare market before changing the selection', () => {
    const before = chart.symbols.peek()
    expect(() =>
      chart.setSymbols([{
        symbol: 'IF2608',
        market: 'FUTURES',
        period: TIME_SHARE_PERIOD,
        source: 'session-fixture',
      }]),
    ).toThrow('Market session is not registered: FUTURES')
    expect(chart.symbols.peek()).toBe(before)
    expect(chart.kernel.mode.readonly.dataView.peek()).toBe(ChartDataViewId.KLine)
  })

  it.each([
    (target: Chart) => target.setCurrentPeriod('not-a-period'),
    (target: Chart) => target.switchToTimeShareForDate(20260231),
    (target: Chart) => target.setSymbols([{ ...target.symbols.peek()[0]!, adjust: 'unknown' }]),
  ])('preserves the market, data, view and range selection on invalid input', (select) => {
    chart.setRangeSelection(10, 20)
    const signals = [
      chart.symbols,
      chart.kernel.dataManager.readonly.currentSpec,
      chart.kernel.data.readonly.activeBuffer,
      chart.kernel.mode.readonly.dataView,
      chart.kernel.interaction.readonly.rangeSelection,
    ]
    const before = signals.map((signal) => signal.peek())
    const changed = vi.fn()
    signals.forEach((signal) => signal.subscribe(changed))
    expect(() => select(chart)).toThrow()
    signals.forEach((signal, index) => expect(signal.peek()).toBe(before[index]))
    expect(changed).not.toHaveBeenCalled()
  })

  it('switches the symbol, active buffer and public selection together', () => {
    const oldBuffer = chart.kernel.data.readonly.activeSelection.peek()
    const snapshots: unknown[] = []
    chart.symbols.subscribe(() => snapshots.push([
      chart.symbols.peek()[0]?.symbol,
      chart.kernel.dataManager.readonly.currentSpec.peek()?.symbol,
      chart.kernel.data.readonly.activeSelection.peek(),
    ]))
    chart.setCurrentSymbol('00700')
    const nextBuffer = chart.kernel.data.readonly.activeSelection.peek()
    expect(nextBuffer).not.toEqual(oldBuffer)
    expect(snapshots).toEqual([['00700', '00700', nextBuffer]])
  })
})
