/**
 * createDataMethods — 数据与区间选择的委托方法集。
 *
 * 从 createChartController 中抽离，统一把数据/区间选择 API 委托给 Chart facade，
 * 方法均以 isDisposed 作为销毁短路条件；网络生命周期由活动行情运行模块管理。
 */

import type { Chart } from '@/engine/chart/index.js'
import type { KLineData, SymbolInfo, SymbolSpec } from '../types.js'

/**
 * 创建数据与区间选择委托方法集。
 *
 * @param chart 被委托的 Chart facade。
 * @param isDisposed 控制器是否已销毁的读取器，用于销毁后短路。
 * @returns methods 为公开委托方法。
 */
export function createDataMethods(chart: Chart, isDisposed: () => boolean) {
  /** 公开门面只改变品种选择，历史与增量写入归行情运行时。 */
  function setSymbols(next: ReadonlyArray<SymbolSpec>): void {
    if (isDisposed()) return
    chart.clearRangeSelection()
    chart.setSymbols(next)
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

  /** 将比较折线可见性操作委托给 core。 */
  function setComparisonHidden(identity: string, hidden: boolean): void {
    if (isDisposed()) return
    chart.setComparisonHidden(identity, hidden)
  }


  function setCurrentSymbol(symbol: string): void {
    if (isDisposed()) return
    chart.clearRangeSelection()
    chart.setCurrentSymbol(symbol)
  }

  function setCurrentPeriod(period: string): void {
    if (isDisposed()) return
    chart.clearRangeSelection()
    chart.setCurrentPeriod(period)
  }

  function switchToTimeShareForDate(dateYYYYMMDD: number): void {
    if (isDisposed()) return
    chart.switchToTimeShareForDate(dateYYYYMMDD)
  }

  function registerSymbols(infos: ReadonlyArray<SymbolInfo>): void {
    if (isDisposed()) return
    chart.registerSymbols(infos)
  }


  function clearMarketDataCache(): void {
    if (isDisposed()) return
    chart.getMarketDataCache().clear()
  }

  function ensureDataRange(startTs: number): void {
    if (isDisposed()) return
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


  function getData(): ReadonlyArray<KLineData> {
    if (isDisposed()) return []
    return chart.getData()
  }

  return {
    methods: {
      setSymbols,
      registerSymbols,
      setComparisonSpecs,
      addComparisonSymbol,
      removeComparisonSymbol,
      setComparisonHidden,
      setCurrentSymbol,
      setCurrentPeriod,
      switchToTimeShareForDate,
      clearMarketDataCache,
      ensureDataRange,
      startRangeSelection,
      updateRangeSelection,
      finishRangeSelection,
      setRangeSelection,
      clearRangeSelection,
      getData,
    },
  }
}
