/**
 * createDataMethods — 数据、区间选择与实时订阅的委托方法集。
 *
 * 从 createChartController 中抽离，统一把数据/区间选择 API 委托给 Chart facade，
 * 并编排当前活动品种的实时 K 线订阅（BarsLiveSubscription）。方法均以 isDisposed
 * 作为销毁短路条件，dispose() 负责退订 currentSpec 并停止实时连接。
 */

import { BarsLiveSubscription } from '@/data/live/barsLive.js'
import { ORIGINAL_BAR_AGGREGATION } from '@/data/provider/types.js'
import type { Chart } from '@/engine/chart.js'
import type { CustomDataSource, KLineData, SymbolInfo, SymbolSpec } from '../types.js'

/**
 * 创建数据/区间选择/实时订阅委托方法集。
 *
 * @param chart 被委托的 Chart facade。
 * @param isDisposed 控制器是否已销毁的读取器，用于销毁后短路。
 * @returns methods 为公开委托方法，dispose 用于退订并停止实时连接。
 */
export function createDataMethods(chart: Chart, isDisposed: () => boolean) {
  const liveBars = new BarsLiveSubscription({ updateBars })

  /** 按当前活动品种协调 MT5 K 线实时订阅。 */
  function reconcileLiveBars(): void {
    const selection = chart.kernel.data.readonly.activeSelection.peek()
    const barAggregation =
      selection?.kind === 'bars' ? selection.barAggregation : ORIGINAL_BAR_AGGREGATION
    liveBars.reconcile(chart.kernel.dataManager.readonly.currentSpec.peek(), barAggregation)
  }

  // 当前品种的 Provider 在自动路由完成后会写回 currentSpec，此时重新检查实时能力。
  const unsubscribeLiveBars =
    chart.kernel.dataManager.readonly.currentSpec.subscribe(reconcileLiveBars)
  reconcileLiveBars()

  function setData(next: ReadonlyArray<KLineData>): void {
    if (isDisposed()) return
    chart.setData([...next])
  }

  /** 实时帧写入：末尾窗口 replace-on-conflict（SSE forming/closed 链路），写后自动联动指标与重绘。 */
  function updateBars(next: ReadonlyArray<KLineData>): void {
    if (isDisposed()) return
    chart.updateBars([...next])
  }

  function setSymbols(next: ReadonlyArray<SymbolSpec>): void {
    if (isDisposed()) return
    chart.clearRangeSelection()
    chart.setSymbols(next)
    reconcileLiveBars()
  }

  function setComparisonSpecs(next: ReadonlyArray<SymbolSpec>): void {
    if (isDisposed()) return
    chart.setComparisonSpecs(next)
  }

  function addComparisonSymbol(spec: SymbolSpec, primary?: SymbolSpec | null): void {
    if (isDisposed()) return
    chart.addComparisonSymbol(spec, primary ?? null)
  }

  function removeComparisonSymbol(symbol: string): void {
    if (isDisposed()) return
    chart.removeComparisonSymbol(symbol)
  }

  function setComparisonData(symbol: string, data: ReadonlyArray<KLineData>): void {
    if (isDisposed()) return
    chart.setComparisonData(symbol, [...data])
  }

  function setCurrentSymbol(symbol: string): void {
    if (isDisposed()) return
    chart.clearRangeSelection()
    chart.setCurrentSymbol(symbol)
    reconcileLiveBars()
  }

  function setCurrentPeriod(period: string): void {
    if (isDisposed()) return
    chart.clearRangeSelection()
    chart.setCurrentPeriod(period)
    reconcileLiveBars()
  }

  function switchToTimeShareForDate(dateYYYYMMDD: number): void {
    if (isDisposed()) return
    chart.switchToTimeShareForDate(dateYYYYMMDD)
  }

  function registerSymbols(infos: ReadonlyArray<SymbolInfo>): void {
    if (isDisposed()) return
    chart.registerSymbols(infos)
  }

  function applyCustomData(source: CustomDataSource): void {
    if (isDisposed()) return
    chart.clearRangeSelection()
    chart.applyCustomData(source)
  }

  function resetToFetcher(spec: SymbolSpec): void {
    if (isDisposed()) return
    chart.clearRangeSelection()
    chart.resetToFetcher(spec)
  }

  function clearMarketDataCache(): void {
    if (isDisposed()) return
    chart.getMarketDataCache().clear()
  }

  function ensureDataRange(startTs: number): void {
    if (isDisposed()) return
    const buf = chart.dataBuffer
    const loadedTimeRange = buf.loadedTimeRange
    if (!loadedTimeRange || startTs >= loadedTimeRange.earliestTs) return
    chart.ensureDataRange(startTs)
  }

  function startRangeSelection(timestamp: number): void {
    if (isDisposed()) return
    chart.startRangeSelection(timestamp)
  }

  function updateRangeSelection(timestamp: number): void {
    if (isDisposed()) return
    chart.updateRangeSelection(timestamp)
  }

  function finishRangeSelection(timestamp?: number): void {
    if (isDisposed()) return
    chart.finishRangeSelection(timestamp)
  }

  function setRangeSelection(startTimestamp: number, endTimestamp: number): void {
    if (isDisposed()) return
    chart.setRangeSelection(startTimestamp, endTimestamp)
  }

  function clearRangeSelection(): void {
    if (isDisposed()) return
    chart.clearRangeSelection()
  }

  function appendData(next: ReadonlyArray<KLineData>): void {
    if (isDisposed()) return
    const current = chart.data.peek()
    const merged = [...current, ...next]
    setData(merged)
  }

  function getData(): ReadonlyArray<KLineData> {
    if (isDisposed()) return []
    return chart.getData()
  }

  /** 退订 currentSpec 监听并停止实时连接；由控制器 dispose 调用。 */
  function dispose(): void {
    unsubscribeLiveBars()
    liveBars.stop()
  }

  return {
    methods: {
      setSymbols,
      registerSymbols,
      setComparisonSpecs,
      addComparisonSymbol,
      removeComparisonSymbol,
      setComparisonData,
      setCurrentSymbol,
      setCurrentPeriod,
      switchToTimeShareForDate,
      applyCustomData,
      clearMarketDataCache,
      resetToFetcher,
      ensureDataRange,
      startRangeSelection,
      updateRangeSelection,
      finishRangeSelection,
      setRangeSelection,
      clearRangeSelection,
      setData,
      updateBars,
      appendData,
      updateData: setData,
      getData,
    },
    dispose,
  }
}
