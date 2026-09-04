import type {
  ChartController,
  ChartViewport,
  KLineData,
  PaneSpec,
} from '@363045841yyt/klinechart-core/controllers'
import { computed, ref, type Ref } from 'vue'

import { useControllerSignal } from './useControllerSignal'

/** 仅保存 Vue 自身的交互状态；图表业务状态直接订阅 Controller。 */
export function useChartState(controller: Ref<ChartController | null>) {
  const symbolStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const viewport = useControllerSignal<ChartViewport>(
    controller,
    (chart) => chart.viewport,
    () => ({
      zoomLevel: 1,
      plotWidth: 0,
      plotHeight: 0,
      dpr: 1,
      visibleFrom: 0,
      visibleTo: 0,
      kWidth: 0,
      kGap: 1,
    }),
  )
  const data = useControllerSignal<ReadonlyArray<KLineData>>(
    controller,
    (chart) => chart.data,
    () => [],
  )
  const paneRatios = useControllerSignal<Readonly<Record<string, number>>>(
    controller,
    (chart) => chart.paneRatios,
    () => ({}),
  )
  const paneLayout = useControllerSignal<ReadonlyArray<PaneSpec>>(
    controller,
    (chart) => chart.paneLayout,
    () => [],
  )
  const zoomLevel = computed(() => viewport.value.zoomLevel)
  const comparisonColorsMap = ref<Map<string, string>>(new Map())
  const comparisonLoading = ref(false)
  /** range-select 为 UI 模式，不进 kernel DrawingToolId */
  const isRangeSelectMode = ref(false)

  return {
    symbolStatus,
    viewport,
    data,
    zoomLevel,
    paneRatios,
    paneLayout,
    comparisonColorsMap,
    comparisonLoading,
    isRangeSelectMode,
  }
}
