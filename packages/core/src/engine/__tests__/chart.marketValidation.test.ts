/** 使用真实 Chart 验证主品种整体替换的数据视图切换与写入前校验。 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FIVE_DAY_TIME_SHARE_PERIOD,
  TIME_SHARE_PERIOD,
} from '../../controllers/types'
import type { SymbolSpec } from '@/data/symbolSpec.js'
import { Chart, type ChartOptions } from '../chart/index'
import { ChartDataViewId } from '../chartModel/index'
import { MAIN_PANE_ID } from '../pane/types'
import { createChartDom, installChartDomStubs } from './helpers/chartDomTestKit'
import { createTestChartRuntime } from './helpers/chartLifecycleTestKit'

const options: ChartOptions = {
  yPaddingPx: 0,
  rightAxisWidth: 0,
  leftAxisWidth: 0,
  bottomAxisHeight: 24,
  minKWidth: 2,
  maxKWidth: 50,
  panes: [{ id: MAIN_PANE_ID, ratio: 1 }],
}

/** 以当前主品种为底稿构造替换后的 spec；身份字段随周期/品种一起由调用方决定。 */
function withSelection(patch: Partial<SymbolSpec>): SymbolSpec {
  return { ...currentSpec(), ...patch }
}

/** 当前主品种。 */
function currentSpec(): SymbolSpec {
  return {
    instrument: {
      id: 'session-fixture:HK:01810',
      source: 'session-fixture',
      symbol: '01810',
      name: '01810',
      instrumentType: 'stock',
      exchange: 'HK',
      sessionId: 'HK',
      capabilities: {},
    },
    period: 'daily',
    incremental: false,
  }
}

describe('Chart market validation boundaries', () => {
  let chart: Chart
  let restoreDom: () => void

  beforeEach(() => {
    restoreDom = installChartDomStubs()
    chart = new Chart(createChartDom(1000, 600), options, createTestChartRuntime())
    chart.setPrimaryMarket(currentSpec())
  })
  afterEach(async () => {
    await chart.destroy()
    restoreDom()
    vi.restoreAllMocks()
  })

  it.each([
    {
      name: 'timeshare period',
      run: (target: Chart) => target.setPrimaryMarket(withSelection({ period: TIME_SHARE_PERIOD })),
      view: ChartDataViewId.TimeShare,
    },
    {
      name: 'five-day period',
      run: (target: Chart) =>
        target.setPrimaryMarket(withSelection({ period: FIVE_DAY_TIME_SHARE_PERIOD })),
      view: ChartDataViewId.FiveDayTimeShare,
    },
    {
      name: 'historical date',
      run: (target: Chart) =>
        target.setPrimaryMarket(withSelection({ period: TIME_SHARE_PERIOD }), { date: 20260728 }),
      view: ChartDataViewId.TimeShare,
    },
  ])('switches to $view through $name', ({ run, view }) => {
    run(chart)
    expect(chart.kernel.mode.readonly.dataView.peek()).toBe(view)
  })

  it('rejects unknown timeshare market before changing the selection', () => {
    const before = chart.symbols.peek()
    expect(() =>
      chart.setPrimaryMarket({
        instrument: {
          id: 'session-fixture:FUTURES:IF2608',
          source: 'session-fixture',
          symbol: 'IF2608',
          name: 'IF2608',
          instrumentType: 'future',
          exchange: 'FUTURES',
          sessionId: 'FUTURES',
          capabilities: {},
        },
        period: TIME_SHARE_PERIOD,
      }),
    ).toThrow('Market session is not registered: FUTURES')
    expect(chart.symbols.peek()).toBe(before)
    expect(chart.kernel.mode.readonly.dataView.peek()).toBe(ChartDataViewId.KLine)
  })

  it.each([
    [
      'unknown period',
      (target: Chart) => target.setPrimaryMarket(withSelection({ period: 'not-a-period' })),
    ],
    [
      'invalid trading date',
      (target: Chart) =>
        target.setPrimaryMarket(withSelection({ period: TIME_SHARE_PERIOD }), { date: 20260231 }),
    ],
    [
      'unknown adjustment',
      (target: Chart) => target.setPrimaryMarket(withSelection({ adjust: 'unknown' })),
    ],
  ])('preserves the market, data, view and range selection on %s', (_name, select) => {
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
    chart.symbols.subscribe(() =>
      snapshots.push([
        chart.symbols.peek()[0]?.instrument.symbol,
        chart.kernel.dataManager.readonly.currentSpec.peek()?.instrument.symbol,
        chart.kernel.data.readonly.activeSelection.peek(),
      ]),
    )
    // 换品种必须整体替换身份：旧 instrument 不能带进新品种。
    chart.setPrimaryMarket({
      instrument: {
        id: 'session-fixture:HK:00700',
        source: 'session-fixture',
        symbol: '00700',
        name: '00700',
        instrumentType: 'stock',
        exchange: 'HK',
        sessionId: 'HK',
        capabilities: {},
      },
      period: 'daily',
    })
    const nextBuffer = chart.kernel.data.readonly.activeSelection.peek()
    expect(nextBuffer).not.toEqual(oldBuffer)
    expect(snapshots).toEqual([['00700', '00700', nextBuffer]])
  })
})
