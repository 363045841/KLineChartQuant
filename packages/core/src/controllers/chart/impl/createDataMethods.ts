/**
 * createDataMethods — 数据、覆盖与视图定位的委托方法集。
 *
 * 每个方法只把调用原样交给 Chart facade，不在这里做守卫或状态拼接；销毁后统一短路。
 */

import type { CoverageResult } from '@/data/buffer/types.js'
import type { Chart } from '@/engine/chart/index.js'
import type { RangePreset, RangeWindow } from '@/engine/viewport/rangePreset.js'
import type { KLineData, SymbolInfo, SymbolSpec } from '../types.js'

/**
 * 创建数据与视图定位的委托方法集。
 *
 * @param chart 被委托的 Chart facade
 * @param isDisposed 控制器是否已销毁的读取器，用于销毁后短路
 * @returns methods 为公开委托方法
 */
export function createDataMethods(chart: Chart, isDisposed: () => boolean) {
  /** 整体替换主品种；周期、复权与来源都在同一个 spec 里。 */
  function setPrimaryMarket(spec: SymbolSpec | null, options?: { date?: number }): void {
    if (isDisposed()) return
    chart.setPrimaryMarket(spec, options)
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

  function registerSymbols(infos: ReadonlyArray<SymbolInfo>): void {
    if (isDisposed()) return
    chart.registerSymbols(infos)
  }

  function clearMarketDataCache(): void {
    if (isDisposed()) return
    chart.getMarketData().clear()
  }

  /** 让数据池覆盖到给定时间；返回值表明已覆盖、耗尽或序列已切换。 */
  function ensureCoverageFrom(fromTs: number): Promise<CoverageResult> {
    if (isDisposed()) return Promise.resolve<CoverageResult>('superseded')
    return chart.ensureCoverageFrom(fromTs)
  }

  /** 预置对应的时间窗。 */
  function getPresetWindow(preset: RangePreset): RangeWindow | null {
    if (isDisposed()) return null
    return chart.getPresetWindow(preset)
  }

  /** 把时间窗装进屏幕。 */
  function frameTimeRange(from: number, to: number): void {
    if (isDisposed()) return
    chart.frameTimeRange(from, to)
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
      setPrimaryMarket,
      registerSymbols,
      setComparisonSpecs,
      addComparisonSymbol,
      removeComparisonSymbol,
      setComparisonHidden,
      clearMarketDataCache,
      ensureCoverageFrom,
      getPresetWindow,
      frameTimeRange,
      startRangeSelection,
      updateRangeSelection,
      finishRangeSelection,
      setRangeSelection,
      clearRangeSelection,
      getData,
    },
  }
}
