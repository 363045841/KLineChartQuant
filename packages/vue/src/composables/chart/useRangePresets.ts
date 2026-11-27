/**
 * 左下栏时间范围按钮的编排：挑周期 → 整体替换主品种 → 等数据覆盖 → 把窗口装进屏幕。
 *
 * 只做编排，不判断加载状态、不算几何：加载策略归数据层，定位归视图层。
 */

import type { SymbolSpec } from '@363045841yyt/klinechart-core'
import {
  type ChartController,
  ChartDataViewId,
  coarsestPeriod,
  pickRangePeriod,
  type RangePreset,
} from '@363045841yyt/klinechart-core/controllers'
import type { KLinePeriod } from '@363045841yyt/klinechart-core/market-data'
import { type ComputedRef, computed, type Ref, shallowRef } from 'vue'
import { useControllerSignalValue } from './useControllerSignal.js'

/** 一次点击的完整流程。 */
export function useRangePresets(
  controller: Readonly<Ref<ChartController | null>>,
  supportedPeriods: () => readonly KLinePeriod[],
) {
  /** 正在执行的预置；同排按钮在此期间禁点，避免并发定位。 */
  const pending = shallowRef<RangePreset | null>(null)
  /** 当前可见窗口命中的预置；由 Core 派生，平移缩放后自动熄灭。 */
  const active = useControllerSignalValue<RangePreset | null, RangePreset | null>(
    controller,
    (chart) => chart.activeRangePreset,
    (value) => value,
    () => null,
  )
  /** 分时与五日分时不支持范围预置，整排置灰。 */
  const enabled = useControllerSignalValue(
    controller,
    (chart) => chart.chartMode,
    (view) => view === ChartDataViewId.KLine,
    () => false,
  )
  /** 没有主品种时没有可定位的数据。 */
  const hasSymbol = useControllerSignalValue(
    controller,
    (chart) => chart.symbols,
    (symbols) => symbols.length > 0,
    () => false,
  )
  const disabled: ComputedRef<boolean> = computed(
    () => !enabled.value || !hasSymbol.value || pending.value !== null,
  )

  /**
   * 应用一个预置。
   *
   * @param preset 目标范围
   */
  async function apply(preset: RangePreset): Promise<void> {
    const chart = controller.value
    if (!chart || pending.value !== null) return
    const current = chart.symbols.peek()[0]
    if (!current) return
    pending.value = preset
    try {
      if (preset === 'ALL') {
        await frameAllHistory(chart, current)
        return
      }
      // 窗口按当前已加载数据解析：切换周期后缓冲区会重建，事件时间轴不变。
      const target = chart.getPresetWindow(preset)
      if (!target) return
      // 周期由窗口的真实跨度推导，不查任何预置到周期的映射。
      const period = pickRangePeriod(supportedPeriods(), target.to - target.from)
      if (period !== null && period !== current.period) {
        chart.setPrimaryMarket({ ...current, period })
      }
      await chart.ensureCoverageFrom(target.from)
      const bars = chart.getData()
      const last = bars[bars.length - 1]
      chart.frameTimeRange(target.from, last ? last.timestamp : target.to)
    } finally {
      pending.value = null
    }
  }

  /**
   * 框住完整历史。
   *
   * 先用最粗周期把数据补到耗尽，完整跨度由数据本身给出；再按该跨度推导周期并补到耗尽，
   * 最后框全部。整个过程只依赖跨度和数据，不写死任何周期。
   *
   * @param chart 图表控制器
   * @param current 当前主品种
   */
  async function frameAllHistory(chart: ChartController, current: SymbolSpec): Promise<void> {
    const probe = coarsestPeriod(supportedPeriods())
    if (probe === null) return
    if (probe !== current.period) {
      chart.setPrimaryMarket({ ...current, period: probe })
    }
    await chart.ensureCoverageFrom(Number.NEGATIVE_INFINITY)
    const loaded = chart.getData()
    const first = loaded[0]
    const last = loaded[loaded.length - 1]
    if (!first || !last) return
    const period = pickRangePeriod(supportedPeriods(), last.timestamp - first.timestamp)
    if (period !== null && period !== probe) {
      chart.setPrimaryMarket({ ...current, period })
      await chart.ensureCoverageFrom(Number.NEGATIVE_INFINITY)
    }
    const all = chart.getPresetWindow('ALL')
    if (all) chart.frameTimeRange(all.from, all.to)
  }

  return { active, disabled, apply }
}
