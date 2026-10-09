/**
 * 历史加载编排测试（ADR 0008）。
 *
 * - 首次请求按视口宽度定量，一次铺满首屏；
 * - 向左补齐整批收页后一次写入：一次数据变更、一次前插提示、一个 loading 周期；
 * - 在触达左缘前预取；空页视为历史耗尽；
 * - 不足一屏且历史耗尽时贴左，仍可能加载历史时不绘制 T-N 占位。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { KLineData } from '@/controllers/types'
import {
  DEFAULT_BAR_PAGE_LIMIT,
  MAX_BAR_PAGE_LIMIT,
  resolveBarRequestLimit,
} from '@/data/buffer/impl/marketDataPolicy'
import { createKLineData, createMockRenderContext } from '@/engine/__tests__/helpers/renderTestKit'
import { createTimeAxisLayer } from '@/engine/renderers/timeAxis'
import { getPhysicalKLineConfig } from '@/engine/viewport/klineConfig'
import { formatPastSlotLabel, resolveAxisTimeLabel } from '@/foundation/utils/futureSlotLabel'

import type { ChartDataManager } from '../chartDataManager'
import { IncrementalLoadHint } from '../incrementalLoadHint'
import { ScrollCompensator } from '../scrollCompensator'
import {
  createMockViewport,
  createTestChartDataManager,
  createTestDocument,
  createTestProvider,
  makeBarsPage,
  makeDailyBars,
  makeTestSymbolSpec,
  registerTestProvider,
  unregisterTestProvider,
} from './helpers/chartDataManagerTestKit'

/** 测试套件统一几何：kWidth 8 / kGap 2 / dpr 1。 */
const { unitLogical: UNIT, startXLogical: START_X } = getPhysicalKLineConfig(8, 2, 1)
const LEFT_BUFFER = 800

/**
 * 构造一个按游标分页、单页至多 pageCap 根的 Provider；数据集为以 now 结尾的 total 根日线。
 * 返回 fetch 替身以断言请求参数。
 */
function registerPagedProvider(options: { total: number; pageCap: number; now?: number }) {
  const dataset = makeDailyBars(options.total, options.now ?? Date.now())
  const fetch = vi.fn(async (query: { limit: number; beforeTimestamp?: number }) => {
    const before = query.beforeTimestamp
    const eligible =
      before === undefined ? dataset : dataset.filter((bar) => bar.timestamp < before)
    const page = eligible.slice(-Math.min(query.limit, options.pageCap))
    return makeBarsPage(page, {
      olderData: page.length > 0 && page[0] === dataset[0] ? 'exhausted' : 'available',
    })
  })
  registerTestProvider(createTestProvider({ fetchBars: { fetch } }))
  return { fetch, dataset }
}

/** 将视口滚动到左缘之外还剩 marginSlots 根已加载 K 线的位置。 */
function scrollToLeftMargin(scrollTo: (value: number) => void, marginSlots: number): void {
  scrollTo(LEFT_BUFFER + START_X + marginSlots * UNIT)
}

describe('resolveBarRequestLimit', () => {
  it.each([
    { slots: 0, expected: DEFAULT_BAR_PAGE_LIMIT },
    { slots: Number.NaN, expected: DEFAULT_BAR_PAGE_LIMIT },
    { slots: 120, expected: DEFAULT_BAR_PAGE_LIMIT },
    { slots: 1234.2, expected: 1235 },
    { slots: 1_000_000, expected: MAX_BAR_PAGE_LIMIT },
  ])('$slots slots → $expected bars', ({ slots, expected }) => {
    expect(resolveBarRequestLimit(slots)).toBe(expected)
  })
})

describe('ChartDataManager history loading orchestration', () => {
  let manager: ChartDataManager | null = null
  let document: Document

  beforeEach(() => {
    document = createTestDocument()
  })

  afterEach(() => {
    manager?.destroy()
    manager = null
    unregisterTestProvider()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('sizes the first request to the viewport so one request fills the screen', async () => {
    const { fetch } = registerPagedProvider({ total: 5_000, pageCap: 5_000 })
    const viewWidth = 4_500
    manager = createTestChartDataManager(document, {
      viewport: { viewWidth, scrollLeft: LEFT_BUFFER },
    }).manager

    manager.setSymbols([makeTestSymbolSpec('sh.600000')])
    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))

    const visibleSlots = viewWidth / UNIT
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[0]![0].limit).toBe(Math.ceil(visibleSlots * 2))
    expect(fetch.mock.calls[0]![0].limit).toBeGreaterThan(visibleSlots)
    expect(manager.getData()).toHaveLength(Math.ceil(visibleSlots * 2))
  })

  it('falls back to the default page size for narrow viewports', async () => {
    const { fetch } = registerPagedProvider({ total: 2_000, pageCap: 2_000 })
    manager = createTestChartDataManager(document, { viewport: { viewWidth: 800 } }).manager

    manager.setSymbols([makeTestSymbolSpec('sh.600000')])
    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))

    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[0]![0].limit).toBe(DEFAULT_BAR_PAGE_LIMIT)
  })

  it('stitches capped provider pages into one buffer update on first load', async () => {
    const { fetch } = registerPagedProvider({ total: 2_000, pageCap: 200 })
    const harness = createTestChartDataManager(document)
    manager = harness.manager
    const loadingStates: boolean[] = []
    const unsubscribe = harness.dataState.readonly.loading.subscribe(() =>
      loadingStates.push(harness.dataState.readonly.loading.peek()),
    )

    manager.setSymbols([makeTestSymbolSpec('sh.600000')])
    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))
    unsubscribe()

    expect(fetch).toHaveBeenCalledTimes(3)
    expect(manager.getData()).toHaveLength(DEFAULT_BAR_PAGE_LIMIT)
    expect(loadingStates).toEqual([true, false])
  })

  it('fills a visible gap with one batch: one data change, one hint, one loading cycle', async () => {
    const { fetch, dataset } = registerPagedProvider({ total: 3_000, pageCap: 200 })
    const harness = createTestChartDataManager(document)
    manager = harness.manager
    manager.setSymbols([makeTestSymbolSpec('sh.600000')])
    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))
    fetch.mockClear()

    const show = vi.spyOn(IncrementalLoadHint.prototype, 'show')
    let dataEvents = 0
    const loadingStates: boolean[] = []
    const unsubscribeData = manager.dataBuffer.data.subscribe(() => dataEvents++)
    const unsubscribeLoading = harness.dataState.readonly.loading.subscribe(() =>
      loadingStates.push(harness.dataState.readonly.loading.peek()),
    )

    // 露出 12 个空白槽位（左侧加载缓冲区）。
    const blankSlots = 12
    harness.scrollTo(LEFT_BUFFER - blankSlots * UNIT)
    const scrollBefore = harness.getScrollLeft()
    manager.checkVisibleRangeGap()
    manager.checkVisibleRangeGap()

    await vi.waitFor(() => expect(show).toHaveBeenCalled())
    unsubscribeData()
    unsubscribeLoading()

    const batch = resolveBarRequestLimit((800 / UNIT) * 2 + blankSlots)
    expect(fetch.mock.calls.length).toBeGreaterThan(1)
    expect(dataEvents).toBe(1)
    expect(loadingStates).toEqual([true, false])
    expect(show).toHaveBeenCalledOnce()
    expect(show.mock.calls[0]![0]).toBe(batch)
    expect(manager.getData()).toHaveLength(DEFAULT_BAR_PAGE_LIMIT + batch)
    expect(manager.getData()[0]?.timestamp).toBe(
      dataset[dataset.length - DEFAULT_BAR_PAGE_LIMIT - batch]!.timestamp,
    )
    // 前插后滚动补偿，视口内容不跳动。
    expect(harness.getScrollLeft()).toBeCloseTo(scrollBefore + batch * UNIT)
  })

  it('prefetches silently before the user reaches the left edge', async () => {
    const { fetch } = registerPagedProvider({ total: 3_000, pageCap: 5_000 })
    const harness = createTestChartDataManager(document)
    manager = harness.manager
    manager.setSymbols([makeTestSymbolSpec('sh.600000')])
    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))
    fetch.mockClear()
    const visibleSlots = 800 / UNIT
    const show = vi.spyOn(IncrementalLoadHint.prototype, 'show')
    const loadingStates: boolean[] = []
    const bufferLoadingStates: boolean[] = []
    const unsubscribeLoading = harness.dataState.readonly.loading.subscribe(() =>
      loadingStates.push(harness.dataState.readonly.loading.peek()),
    )
    const unsubscribeBufferLoading = manager.dataBuffer.loading.subscribe(() =>
      bufferLoadingStates.push(manager!.dataBuffer.loading.peek()),
    )

    // 余量充足：不请求。
    scrollToLeftMargin(harness.scrollTo, Math.ceil(visibleSlots))
    manager.checkVisibleRangeGap()
    expect(fetch).not.toHaveBeenCalled()

    // 余量不足阈值但视口内无空白：静默预取，且进行中不重复请求。
    scrollToLeftMargin(harness.scrollTo, Math.floor(visibleSlots / 2))
    manager.checkVisibleRangeGap()
    manager.checkVisibleRangeGap()
    await vi.waitFor(() =>
      expect(manager!.getData().length).toBeGreaterThan(DEFAULT_BAR_PAGE_LIMIT),
    )
    await new Promise((resolve) => window.setTimeout(resolve, 10))
    unsubscribeLoading()
    unsubscribeBufferLoading()

    expect(fetch).toHaveBeenCalledOnce()
    expect(loadingStates).toEqual([])
    expect(bufferLoadingStates).toEqual([])
    expect(show).not.toHaveBeenCalled()
    expect(harness.dataManagerState.readonly.pendingIncrementalLoad.peek().count).toBe(0)
  })

  it('upgrades an in-flight prefetch to one loading cycle when the user stops at a blank gap', async () => {
    const { fetch } = registerPagedProvider({ total: 3_000, pageCap: 5_000 })
    const harness = createTestChartDataManager(document)
    manager = harness.manager
    manager.setSymbols([makeTestSymbolSpec('sh.600000')])
    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))
    const show = vi.spyOn(IncrementalLoadHint.prototype, 'show')
    const loadingStates: boolean[] = []
    const unsubscribe = harness.dataState.readonly.loading.subscribe(() =>
      loadingStates.push(harness.dataState.readonly.loading.peek()),
    )
    // 挂起静默预取的 Provider 响应，模拟用户在加载途中拖入空白。
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const original = fetch.getMockImplementation()!
    fetch.mockImplementation(async (query) => {
      await gate
      return original(query)
    })

    scrollToLeftMargin(harness.scrollTo, 10)
    manager.checkVisibleRangeGap()
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(loadingStates).toEqual([])

    harness.scrollTo(LEFT_BUFFER - 5 * UNIT)
    manager.checkVisibleRangeGap()
    manager.checkVisibleRangeGap()
    expect(loadingStates).toEqual([true])
    release()

    await vi.waitFor(() => expect(show).toHaveBeenCalled())
    unsubscribe()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(loadingStates).toEqual([true, false])
    expect(show).toHaveBeenCalledOnce()
  })

  it('shows the hint without a loading cycle when a silent batch lands in a visible gap', async () => {
    const { fetch } = registerPagedProvider({ total: 3_000, pageCap: 5_000 })
    const harness = createTestChartDataManager(document)
    manager = harness.manager
    manager.setSymbols([makeTestSymbolSpec('sh.600000')])
    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))
    const show = vi.spyOn(IncrementalLoadHint.prototype, 'show')
    const loadingStates: boolean[] = []
    const unsubscribe = harness.dataState.readonly.loading.subscribe(() =>
      loadingStates.push(harness.dataState.readonly.loading.peek()),
    )
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const original = fetch.getMockImplementation()!
    fetch.mockImplementation(async (query) => {
      await gate
      return original(query)
    })

    scrollToLeftMargin(harness.scrollTo, 10)
    manager.checkVisibleRangeGap()
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    // 拖拽中露出空白（拖拽期间不做缺口检查），随后静默批次落地。
    harness.scrollTo(LEFT_BUFFER - 5 * UNIT)
    release()

    await vi.waitFor(() => expect(show).toHaveBeenCalledOnce())
    unsubscribe()
    expect(loadingStates).toEqual([])
  })

  it('does not surface errors from a silent prefetch', async () => {
    const now = Date.now()
    let calls = 0
    registerTestProvider(
      createTestProvider({
        fetchBars: {
          async fetch() {
            calls++
            if (calls > 1) throw new Error('prefetch failed')
            return makeBarsPage(makeDailyBars(500, now), { olderData: 'available' })
          },
        },
      }),
    )
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const harness = createTestChartDataManager(document)
    manager = harness.manager
    manager.setSymbols([makeTestSymbolSpec('sh.600000')])
    await vi.waitFor(() => expect(manager!.getData()).toHaveLength(500))

    scrollToLeftMargin(harness.scrollTo, 10)
    manager.checkVisibleRangeGap()
    await vi.runAllTimersAsync()
    await vi.waitFor(() => expect(calls).toBeGreaterThan(1))
    await vi.runAllTimersAsync()
    vi.useRealTimers()

    expect(manager.dataError.peek()).toBeNull()
    expect(harness.dataState.readonly.loading.peek()).toBe(false)
    expect(manager.hasPendingOlderHistory()).toBe(true)
  })

  it('treats an empty older page as exhausted and stops requesting', async () => {
    const now = Date.now()
    const fetch = vi.fn(async (query: { beforeTimestamp?: number }) =>
      makeBarsPage(query.beforeTimestamp === undefined ? makeDailyBars(500, now) : [], {
        olderData: 'available',
      }),
    )
    registerTestProvider(createTestProvider({ fetchBars: { fetch } }))
    const harness = createTestChartDataManager(document)
    manager = harness.manager
    manager.setSymbols([makeTestSymbolSpec('sh.600000')])
    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))
    expect(manager.hasPendingOlderHistory()).toBe(true)

    harness.scrollTo(0)
    manager.checkVisibleRangeGap()
    await vi.waitFor(() => expect(manager!.dataBuffer.loading.peek()).toBe(false))
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(manager.dataBuffer.olderData).toBe('exhausted')
    expect(manager.hasPendingOlderHistory()).toBe(false)

    manager.checkVisibleRangeGap()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('left-aligns short data once the source reports no older history', async () => {
    const short: KLineData[] = makeDailyBars(10, Date.now())
    registerTestProvider(
      createTestProvider({
        fetchBars: { fetch: async () => makeBarsPage(short, { olderData: 'exhausted' }) },
      }),
    )
    const harness = createTestChartDataManager(document)
    manager = harness.manager
    manager.setSymbols([makeTestSymbolSpec('sh.600000')])
    await vi.waitFor(() => expect(manager!.getData()).toHaveLength(10))

    expect(harness.getScrollLeft()).toBe(LEFT_BUFFER)
    expect(manager.hasPendingOlderHistory()).toBe(false)
  })

  it('keeps short data right-aligned and suppresses past labels while history may still load', async () => {
    const short: KLineData[] = makeDailyBars(10, Date.now())
    // 忽略游标的 Provider：后续补页不推进覆盖，批次保留首页并保持“可能还有历史”。
    registerTestProvider(
      createTestProvider({
        fetchBars: { fetch: async () => makeBarsPage(short, { olderData: 'available' }) },
      }),
    )
    const harness = createTestChartDataManager(document)
    manager = harness.manager
    manager.setSymbols([makeTestSymbolSpec('sh.600000')])
    await vi.waitFor(() => expect(manager!.getData()).toHaveLength(10))

    const lastBarEnd = START_X + short.length * UNIT
    expect(harness.getScrollLeft()).toBe(LEFT_BUFFER - (800 - lastBarEnd))
    expect(manager.dataError.peek()).toBeNull()
    expect(manager.hasPendingOlderHistory()).toBe(true)
  })

  it('reports no pending history for inline data', () => {
    manager = createTestChartDataManager(document).manager
    manager.setData(makeDailyBars(5, Date.now()))
    expect(manager.hasPendingOlderHistory()).toBe(false)
  })
})

describe('ScrollCompensator short-data alignment', () => {
  it('aligns the first bar to the left edge only when asked', () => {
    const { viewport, getScrollLeft } = createMockViewport({
      leftLoadBufferWidth: LEFT_BUFFER,
      contentWidth: 1_600,
      viewWidth: 800,
    })
    const compensator = new ScrollCompensator({
      getOption: () => ({ kWidth: 8, kGap: 2 }),
      viewport,
    })

    compensator.scrollToRight(10, { alignShortDataLeft: true })
    expect(getScrollLeft()).toBe(LEFT_BUFFER)

    compensator.scrollToRight(10)
    expect(getScrollLeft()).toBe(LEFT_BUFFER - (800 - (START_X + 10 * UNIT)))
  })
})

describe('past-slot placeholder labels', () => {
  it('formats past slots only when enabled; future slots are unaffected', () => {
    const format = () => 'date'
    expect(formatPastSlotLabel(-3)).toBe('T-3')
    expect(formatPastSlotLabel(-3, false)).toBeNull()
    expect(resolveAxisTimeLabel(-3, 5, null, format, false)).toBeNull()
    expect(resolveAxisTimeLabel(7, 5, null, format, false)).toBe('T+3')
    expect(resolveAxisTimeLabel(-3, 5, 1, format, false)).toBe('date')
  })

  it.each([
    { pastSlotLabels: undefined, expectLabels: true },
    { pastSlotLabels: true, expectLabels: true },
    { pastSlotLabels: false, expectLabels: false },
  ])(
    'time axis past ticks with pastSlotLabels=$pastSlotLabels',
    ({ pastSlotLabels, expectLabels }) => {
      const context = createMockRenderContext({
        data: createKLineData(5),
        scrollLeft: -1000,
        range: { start: 0, end: 0 },
        ...(pastSlotLabels === undefined ? {} : { pastSlotLabels }),
      })
      createTimeAxisLayer({
        height: 24,
        getCrosshair: () => ({ x: 42, index: -10 }),
      }).paint({ ...context, paneId: 'xAxis', clear: false })

      const ticks = context.axisLabels.forSurface('xTicks').labels
      const crosshair = context.axisLabels.forSurface('xCrosshair').labels
      if (expectLabels) {
        expect(ticks.length).toBeGreaterThan(0)
        expect(crosshair[0]?.text).toBe('T-10')
      } else {
        expect(ticks.some((tick) => tick.text.startsWith('T-'))).toBe(false)
        expect(crosshair).toHaveLength(0)
      }
    },
  )

  it('keeps future-slot labels to the right of the last bar when past labels are off', () => {
    const data = createKLineData(5)
    const context = createMockRenderContext({ data, pastSlotLabels: false })
    createTimeAxisLayer({
      height: 24,
      getCrosshair: () => ({ x: 42, index: data.length + 2 }),
    }).paint({ ...context, paneId: 'xAxis', clear: false })

    expect(context.axisLabels.forSurface('xCrosshair').labels[0]?.text).toBe('T+3')
  })
})
