/** 预置完整链路：覆盖加载 → 一次提交定位 → 可见窗口派生高亮。 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Chart, type ChartOptions } from '../chart/index'
import { unregisterTestProvider } from '../data/__tests__/helpers/chartDataManagerTestKit'
import { MAIN_PANE_ID } from '../pane/types'
import { createChartDom, installChartDomStubs } from './helpers/chartDomTestKit'
import { createTestChartRuntime } from './helpers/chartLifecycleTestKit'
import { dailySpec, installDailySource } from './helpers/dailyBarsTestKit'

const options: ChartOptions = {
  yPaddingPx: 0,
  rightAxisWidth: 0,
  leftAxisWidth: 0,
  bottomAxisHeight: 24,
  minKWidth: 1,
  maxKWidth: 200,
  panes: [{ id: MAIN_PANE_ID, ratio: 1 }],
}

const DAY_COUNT = 400

describe('Chart range preset flow', () => {
  let chart: Chart
  let restoreDom: () => void

  beforeEach(() => {
    restoreDom = installChartDomStubs()
    chart = new Chart(createChartDom(1000, 600), options, createTestChartRuntime())
  })

  afterEach(async () => {
    await chart.destroy()
    restoreDom()
    unregisterTestProvider()
    vi.restoreAllMocks()
  })

  it('covers the preset window, frames it and derives the active chip', async () => {
    const { dataset } = installDailySource(DAY_COUNT)
    chart.setPrimaryMarket(dailySpec())
    await vi.waitFor(() => expect(chart.data.peek()).toHaveLength(DAY_COUNT))

    const window = chart.getPresetWindow('1M')
    expect(window).not.toBeNull()
    await expect(chart.ensureCoverageFrom(window!.from)).resolves.toBe('covered')
    chart.frameTimeRange(window!.from, dataset.at(-1)!)

    const viewport = chart.viewport.peek()
    expect(viewport.visibleTo).toBeGreaterThanOrEqual(DAY_COUNT)
    expect(viewport.visibleFrom).toBeGreaterThan(DAY_COUNT - 40)
    expect(chart.activeRangePreset.peek()).toBe('1M')
  })

  it('drops the derived chip once the view leaves the newest bar', async () => {
    installDailySource(DAY_COUNT)
    chart.setPrimaryMarket(dailySpec())
    await vi.waitFor(() => expect(chart.data.peek()).toHaveLength(DAY_COUNT))

    const window = chart.getPresetWindow('1M')!
    chart.frameTimeRange(window.from, window.to)
    expect(chart.activeRangePreset.peek()).toBe('1M')

    chart.scrollByBars(-20)
    expect(chart.activeRangePreset.peek()).toBeNull()
  })

  it('frames the whole loaded history for an all-history window', async () => {
    installDailySource(DAY_COUNT)
    chart.setPrimaryMarket(dailySpec())
    await vi.waitFor(() => expect(chart.data.peek()).toHaveLength(DAY_COUNT))

    const all = chart.getPresetWindow('ALL')!
    chart.frameTimeRange(all.from, all.to)

    expect(chart.viewport.peek().visibleFrom).toBeLessThanOrEqual(2)
    expect(chart.activeRangePreset.peek()).toBe('ALL')
  })
})
