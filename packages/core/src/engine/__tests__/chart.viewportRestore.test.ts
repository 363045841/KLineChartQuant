/** 序列视图恢复：布局重开与序列切换都必须回到保存的中心与缩放。 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Chart, type ChartOptions } from '../chart/index'
import { MarketDataContext } from '@/data/management/context.js'
import { MarketDataProviderRegistry } from '@/data/provider/registry.js'
import { MAIN_PANE_ID } from '../pane/types'
import { createChartDom, installChartDomStubs, ResizeObserverMock } from './helpers/chartDomTestKit'
import { createTestChartRuntime } from './helpers/chartLifecycleTestKit'
import { dailySpec, installDailySource } from './helpers/dailyBarsTestKit'
import { seriesViewportKey } from '../viewport/viewMemory/index.js'

const options: ChartOptions = {
  yPaddingPx: 0,
  rightAxisWidth: 0,
  leftAxisWidth: 0,
  bottomAxisHeight: 24,
  minKWidth: 1,
  maxKWidth: 200,
  panes: [{ id: MAIN_PANE_ID, ratio: 1 }],
}

const DAY_COUNT = 120

describe('Chart viewport restore', () => {
  let chart: Chart
  let restoreDom: () => void
  let market: MarketDataContext

  function mount(dayCount: number, width = 1_000) {
    const registry = new MarketDataProviderRegistry()
    const history = installDailySource(dayCount, registry)
    market = new MarketDataContext(registry)
    chart = new Chart(createChartDom(width, 600), options, createTestChartRuntime({ marketDataContext: market }))
    return history
  }

  beforeEach(() => {
    restoreDom = installChartDomStubs()
  })

  afterEach(async () => {
    await chart.destroy()
    restoreDom()
    market.dispose()
    vi.restoreAllMocks()
  })

  it('applies the saved layout view even when the symbol is unchanged', async () => {
    const { dataset } = mount(DAY_COUNT)
    await chart.setPrimaryMarket(dailySpec())

    chart.frameTimeRange(dataset[20]!, dataset[40]!)
    const saved = chart.viewport.peek()
    const document = chart.kernel.exportLayout()

    // 先离开保存的位置，确保恢复不是空操作。
    chart.scrollToRight()
    expect(chart.viewport.peek().visibleFrom).not.toBe(saved.visibleFrom)

    await chart.applyLayout(document)
    expect(chart.viewport.peek().visibleFrom).toBeGreaterThanOrEqual(saved.visibleFrom - 1)
    expect(chart.viewport.peek().visibleFrom).toBeLessThanOrEqual(saved.visibleFrom + 1)
    expect(chart.viewport.peek().visibleTo).toBeGreaterThanOrEqual(saved.visibleTo - 1)
  })

  it('restores a series view after switching away and back', async () => {
    const { dataset } = mount(DAY_COUNT)
    const first = dailySpec('sh.600000')
    const second = dailySpec('sh.600001')
    await chart.setPrimaryMarket(first)

    chart.frameTimeRange(dataset[10]!, dataset[30]!)
    const saved = chart.viewport.peek()

    await chart.setPrimaryMarket(second)
    expect(chart.dataError.peek()).toBeNull()
    expect(chart.symbols.peek()[0]?.instrument.symbol).toBe('sh.600001')
    await chart.setPrimaryMarket(first)
    expect(chart.symbols.peek()[0]?.instrument.symbol).toBe('sh.600000')

    expect(chart.viewport.peek().visibleFrom).toBeGreaterThanOrEqual(saved.visibleFrom - 1)
    expect(chart.viewport.peek().visibleFrom).toBeLessThanOrEqual(saved.visibleFrom + 1)
    expect(chart.viewport.peek().visibleTo).toBeGreaterThanOrEqual(saved.visibleTo - 1)
  })

  it('commits a restored view only once history spans the saved start through the latest bar', async () => {
    const { dataset, fetch } = mount(1_200)
    const currentSymbol = dailySpec()
    const viewport = {
      [seriesViewportKey(currentSymbol)]: { fromTime: dataset[199]!, toTime: dataset[220]! },
    }

    const committed = chart.applyLayout({ ...chart.kernel.createLayout(), currentSymbol, viewport })
    expect(chart.kernel.dataManager.readonly.currentSpec.peek()).toBeNull()
    await committed

    const bars = chart.getData()
    expect(fetch.mock.calls.map(([query]) => query.beforeTimestamp)).toEqual([
      undefined,
      dataset[700],
      dataset[200],
    ])
    expect(bars[0]?.timestamp).toBe(dataset[0])
    expect(bars.at(-1)?.timestamp).toBe(dataset.at(-1))
    expect(Math.abs(chart.viewport.peek().visibleFrom - 199)).toBeLessThanOrEqual(2)
    expect(chart.kernel.exportLayout().viewport).toEqual(viewport)
  })

  it('waits for measurement before projecting a saved range', async () => {
    const { dataset } = mount(DAY_COUNT, 0)
    const currentSymbol = dailySpec()
    const viewport = {
      [seriesViewportKey(currentSymbol)]: { fromTime: dataset[30]!, toTime: dataset[50]! },
    }

    const committed = chart.applyLayout({ ...chart.kernel.createLayout(), currentSymbol, viewport })
    expect(chart.getData()).toHaveLength(0)
    expect(chart.viewport.peek().plotWidth).toBe(0)

    ResizeObserverMock.instances[0]!.emit({
      contentRect: { width: 1_000, height: 600 } as DOMRectReadOnly,
    })
    await committed

    expect(chart.getData()).toHaveLength(DAY_COUNT)
    expect(Math.abs(chart.viewport.peek().visibleFrom - 30)).toBeLessThanOrEqual(2)
  })

  it('keeps the committed chart when historical coverage cannot reach the saved window', async () => {
    const { dataset } = mount(DAY_COUNT)
    const currentSymbol = dailySpec()
    await chart.setPrimaryMarket(currentSymbol)
    chart.frameTimeRange(dataset[30]!, dataset[50]!)
    const before = chart.kernel.exportLayout()
    const viewport = { [seriesViewportKey(currentSymbol)]: { fromTime: dataset[0]! - 1, toTime: dataset[50]! } }

    await expect(chart.applyLayout({ ...before, viewport })).rejects.toThrow('已保存的视口超出可用历史范围')
    expect(chart.kernel.exportLayout()).toEqual(before)
    expect(Math.abs(chart.viewport.peek().visibleFrom - 30)).toBeLessThanOrEqual(2)
  })
})
