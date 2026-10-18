/** ChartModel 状态：当前数据视图、主序列渲染偏好与视图派生能力。 */
import { batch, computed, createSubState } from '../../../../foundation/reactivity/signal.js'
import { createSignal, type ReadonlySignal } from '../../../../foundation/reactivity/signal.js'
import type { ChartSettings } from '../../../../foundation/config/chartSettings.js'
import {
  CHART_VIEW_DEFINITIONS,
  type ChartDataView,
  ChartDataViewId,
  DEFAULT_PRIMARY_RENDERERS,
  isTimeShareDataView,
  type PrimaryRendererByView,
  type ViewCapabilities,
} from './chartViews.js'

/** 主序列画法从设置派生，模型不再保存一份独立的 K 线偏好。 */
export function createChartModel(settings$: ReadonlySignal<ChartSettings> = createSignal({})) {
  const { signals, readonly: sourceReadonly } = createSubState({
    dataView: ChartDataViewId.KLine as ChartDataView,
    lastBarPeriod: 'daily',
  })
  const primaryRendererByView = computed<PrimaryRendererByView>(() => ({
    ...DEFAULT_PRIMARY_RENDERERS,
    [ChartDataViewId.KLine]: settings$().klineShape ?? CHART_VIEW_DEFINITIONS[ChartDataViewId.KLine].primaryRenderer,
  }))
  const effectivePrimaryRenderer = computed(() => {
    const view = sourceReadonly.dataView()
    return primaryRendererByView()[view]
  })
  const interactionCapabilities = computed<Readonly<ViewCapabilities>>(
    () => CHART_VIEW_DEFINITIONS[sourceReadonly.dataView()].capabilities,
  )

  const setDataView = (view: ChartDataView, lastBarPeriod?: string): void => {
    if (isTimeShareDataView(view) && lastBarPeriod && !isTimeShareDataView(lastBarPeriod)) {
      signals.lastBarPeriod.set(lastBarPeriod)
    }
    if (signals.dataView.peek() === view) return
    signals.dataView.set(view)
  }

  return {
    readonly: {
      ...sourceReadonly,
      primaryRendererByView,
      /** 兼容现有 Controller API；与 dataView 指向同一只读 Signal。 */
      chartMode: sourceReadonly.dataView,
      effectivePrimaryRenderer,
      interactionCapabilities,
    },
    actions: {
      setDataView,
      setChartMode: setDataView,
      setLastBarPeriod(period: string): void {
        if (!period || isTimeShareDataView(period) || signals.lastBarPeriod.peek() === period)
          return
        signals.lastBarPeriod.set(period)
      },
    },
    dispose(): void {
      batch(() => {
        signals.dataView.set(ChartDataViewId.KLine)
        signals.lastBarPeriod.set('daily')
      })
    },
  }
}

export type ChartModelModule = ReturnType<typeof createChartModel>
