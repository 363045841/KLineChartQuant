/** 预置完整链路：覆盖加载 → 一次提交定位 → 可见窗口派生高亮。 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SymbolSpec } from '@/data/symbolSpec.js'
import { Chart, type ChartOptions } from '../chart/index'
import {
  createTestProvider,
  instrumentFor,
  MS_PER_DAY,
  makeBarsPage,
  makeKLine,
  registerTestProvider,
  unregisterTestProvider,
} from '../data/__tests__/helpers/chartDataManagerTestKit'
import { MAIN_PANE_ID } from '../pane/types'
import { createChartDom, installChartDomStubs } from './helpers/chartDomTestKit'
import { createTestChartRuntime } from './helpers/chartLifecycleTestKit'

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

/** 最近 `DAY_COUNT` 天的日线夹具；分页按游标切片。 */
function installDailySource() {
  const end = Date.now()
  const dataset = Array.from(
    { length: DAY_COUNT },
    (_, index) => end - (DAY_COUNT - 1 - index) * MS_PER_DAY,
  )
  const fetch = vi.fn(async (query: { beforeTimestamp?: number; limit: number }) => {
    const items = dataset
      .filter(
        (timestamp) => query.beforeTimestamp === undefined || timestamp < query.beforeTimestamp,
      )
      .slice(-query.limit)
      .map(makeKLine)
    return makeBarsPage(items, { olderData: 'exhausted' })
  })
  registerTestProvider(createTestProvider({ fetchBars: { fetch } }))
  return { dataset, fetch }
}

/** 以日线主品种创建图表。 */
function makeSpec(): SymbolSpec {
  return { instrument: instrumentFor('sh.600000'), period: 'daily', adjust: 'none' }
}

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
    const { dataset } = installDailySource()
    chart.setPrimaryMarket(makeSpec())
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
    installDailySource()
    chart.setPrimaryMarket(makeSpec())
    await vi.waitFor(() => expect(chart.data.peek()).toHaveLength(DAY_COUNT))

    const window = chart.getPresetWindow('1M')!
    chart.frameTimeRange(window.from, window.to)
    expect(chart.activeRangePreset.peek()).toBe('1M')

    chart.scrollByBars(-20)
    expect(chart.activeRangePreset.peek()).toBeNull()
  })

  it('frames the whole loaded history for an all-history window', async () => {
    installDailySource()
    chart.setPrimaryMarket(makeSpec())
    await vi.waitFor(() => expect(chart.data.peek()).toHaveLength(DAY_COUNT))

    const all = chart.getPresetWindow('ALL')!
    chart.frameTimeRange(all.from, all.to)

    expect(chart.viewport.peek().visibleFrom).toBeLessThanOrEqual(2)
    expect(chart.activeRangePreset.peek()).toBe('ALL')
  })
})
