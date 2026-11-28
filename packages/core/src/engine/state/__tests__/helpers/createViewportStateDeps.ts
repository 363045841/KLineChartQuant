/**
 * viewportState 测试的依赖夹具。
 *
 * 依赖方向是单向的：几何只声明轴高与密度，缩放级别由导航持有。
 */

import type { TimeShareRange } from '@/data/provider/types'
import { KLINE_GAP_RATIOS } from '@/foundation/config/chartSettings'
import { computed, createSignal } from '@/foundation/reactivity/signal'
import { type ChartDataView, ChartDataViewId } from '@/foundation/types/chartView'
import type { ChartSeriesDatum } from '@/foundation/types/price'
import type { MarketSessionConfig } from '@/foundation/utils/sessionTimeLabels'
import { ASHARE_MARKET_SESSION } from '@/foundation/utils/timeShareAxisLabels'

/** 视口几何输入：只有轴高与密度系数。 */
export interface TestViewportGeometry {
  bottomAxisHeight: number
  gapRatio: number
}

/** `createViewportStateDeps` 的覆盖项。 */
export interface ViewportStateDepsOverrides {
  geometry?: Partial<TestViewportGeometry>
  dataLength?: number
  period?: string
  initialZoomLevel?: number
  zoomLevelCount?: number
  minKWidth?: number
  maxKWidth?: number
}

/**
 * 构造 viewportState 的 signal 依赖，返回可写 signal 供用例改写。
 *
 * @param overrides 覆盖默认依赖值
 * @returns 满足 ViewportSignalDeps 的可写 signal 集合
 */
export function createViewportStateDeps(overrides: ViewportStateDepsOverrides = {}) {
  const geometry$ = createSignal<TestViewportGeometry>({
    bottomAxisHeight: 30,
    gapRatio: KLINE_GAP_RATIOS.standard,
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
  const zoom$ = createSignal({
    minKWidth: overrides.minKWidth ?? 1,
    maxKWidth: overrides.maxKWidth ?? 100,
    zoomLevelCount: overrides.zoomLevelCount ?? 20,
  })
  return {
    geometry$,
    dataLength$,
    dataView$,
    data$,
    marketSession$,
    timeShareRange$,
    zoom$,
    initialZoomLevel: overrides.initialZoomLevel ?? 5,
  }
}
