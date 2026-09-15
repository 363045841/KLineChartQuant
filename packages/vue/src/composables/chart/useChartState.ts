import type {
  ChartController,
  KLineData,
  PaneSpec,
} from '@363045841yyt/klinechart-core/controllers'
import { type Ref, ref } from 'vue'

import { useControllerSignal, useControllerSignalValue } from './useControllerSignal'

/** 仅保存 Vue 自身的交互状态；图表业务状态直接订阅 Controller。 */
export function useChartState(controller: Ref<ChartController | null>) {
  const symbolStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  // visibleFrom/visibleTo 随滚动每帧变化；Vue 只需要低频的 zoomLevel。
  const zoomLevel = useControllerSignalValue(
    controller,
    (chart) => chart.viewport,
    (viewport) => viewport.zoomLevel,
    () => 1,
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
  const comparisonColorsMap = ref<Map<string, string>>(new Map())
  const comparisonLoading = ref(false)
  /** range-select 为 UI 模式，不进 kernel DrawingToolId */
  const isRangeSelectMode = ref(false)

  return {
    symbolStatus,
    data,
    zoomLevel,
    paneRatios,
    paneLayout,
    comparisonColorsMap,
    comparisonLoading,
    isRangeSelectMode,
  }
}
