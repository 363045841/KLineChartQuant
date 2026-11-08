/**
 * viewportState 测试的依赖夹具。
 *
 * 用真实 signal 构造依赖，替代各用例手写的 `() => value as any`，
 * 让依赖形状在编译期受 `ViewportSignalDeps` 约束。
 */

import type { TimeShareRange } from '@/data/provider/types'
import { KLINE_GAP_RATIOS } from '@/foundation/config/chartSettings'
import { computed, createSignal } from '@/foundation/reactivity/signal'
import { type ChartDataView, ChartDataViewId } from '@/foundation/types/chartView'
import type { ChartSeriesDatum } from '@/foundation/types/price'
import {
  ASHARE_MARKET_SESSION,
  type MarketSessionConfig,
} from '@/foundation/utils/timeShareAxisLabels'

/** 测试用视口几何输入：缩放宽度与密度系数由调用方声明，间隙由策略派生。 */
export interface TestViewportGeometry {
  bottomAxisHeight: number
  kWidth: number
  kGapRatio: number
}

/** `createViewportStateDeps` 的覆盖项。 */
export interface ViewportStateDepsOverrides {
  /** 视口几何输入覆盖，与默认值浅合并。 */
  geometry?: Partial<TestViewportGeometry>
  /** 数据长度，默认 100。 */
  dataLength?: number
  /** 周期，默认 daily。 */
  period?: string
  /** 缩放级别，默认 5。 */
  zoomLevel?: number
}

/**
 * 构造 viewportState 的 signal 依赖，返回可写 signal 供用例改写。
 * @param overrides 覆盖默认依赖值。
 * @returns 满足 ViewportSignalDeps 的可写 signal 集合。
 */
export function createViewportStateDeps(overrides: ViewportStateDepsOverrides = {}) {
  const geometry$ = createSignal<TestViewportGeometry>({
    bottomAxisHeight: 30,
    kWidth: 8,
    kGapRatio: KLINE_GAP_RATIOS.standard,
    ...overrides.geometry,
  })
  const dataLength$ = createSignal(overrides.dataLength ?? 100)
  const dataView$ = createSignal<ChartDataView>(
    overrides.period === 'timeshare'
      ? ChartDataViewId.TimeShare
      : overrides.period === '5daytimeshare'
        ? ChartDataViewId.FiveDayTimeShare
        : ChartDataViewId.KLine,
  )
  const data$ = computed<ReadonlyArray<ChartSeriesDatum>>(() =>
    Array.from({ length: dataLength$() }, (_, i) => ({
      timestamp:
        Date.UTC(2026, 0, 5, i < 120 ? 1 : 5, i < 120 ? 30 : 0) + (i < 120 ? i : i - 120) * 60000,
      price: 10,
      average: 10,
      volume: 1,
    })),
  )
  const marketSession$ = createSignal<MarketSessionConfig | null>(ASHARE_MARKET_SESSION)
  const timeShareRange$ = createSignal<TimeShareRange | null>(null)
  const zoomLevel$ = createSignal(overrides.zoomLevel ?? 5)
  return {
    geometry$,
    dataLength$,
    zoomLevel$,
    dataView$,
    data$,
    marketSession$,
    timeShareRange$,
  }
}
