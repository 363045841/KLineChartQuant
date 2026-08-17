/** 图表数据视图、主序列渲染偏好及运行时能力状态。 */
import { batch, computed, createSubState } from '../../foundation/reactivity/signal'

/** 图表数据视图的运行时标识。 */
export const ChartDataViewId = Object.freeze({
  KLine: 'kline',
  TimeShare: 'timeshare',
  Comparison: 'comparison',
} as const)

export type ChartDataView = (typeof ChartDataViewId)[keyof typeof ChartDataViewId]
export type ChartModeId = ChartDataView
export type PrimaryRendererType = 'candlestick' | 'ohlc-bar' | 'line' | 'area'
export type PrimaryRendererByView = Readonly<Record<ChartDataView, PrimaryRendererType>>

export type InteractionCapabilities = Readonly<{
  allowPan: boolean
  allowZoom: boolean
  allowVerticalScroll: boolean
  allowRightAxisScale: boolean
}>

const DEFAULT_PRIMARY_RENDERERS: PrimaryRendererByView = Object.freeze({
  [ChartDataViewId.KLine]: 'candlestick',
  [ChartDataViewId.TimeShare]: 'line',
  [ChartDataViewId.Comparison]: 'line',
})

/** 复制并冻结主序列渲染偏好，避免外部原地修改。 */
function snapshotPrimaryRenderers(
  value: Record<ChartDataView, PrimaryRendererType>,
): PrimaryRendererByView {
  return Object.freeze({ ...value })
}

/** 按数据视图校验主渲染器，不支持的组合回退到视图默认值。 */
function resolveEffectivePrimaryRenderer(
  view: ChartDataView,
  renderer: PrimaryRendererType,
): PrimaryRendererType {
  if (
    (view === ChartDataViewId.TimeShare || view === ChartDataViewId.Comparison) &&
    renderer !== 'line' &&
    renderer !== 'area'
  ) {
    return 'line'
  }
  return renderer
}

export function createModeState() {
  const { signals, readonly: sourceReadonly } = createSubState({
    dataView: ChartDataViewId.KLine as ChartDataView,
    lastBarPeriod: 'daily',
    primaryRendererByView: DEFAULT_PRIMARY_RENDERERS,
  })

  const effectivePrimaryRenderer = computed(() => {
    const view = sourceReadonly.dataView()
    return resolveEffectivePrimaryRenderer(view, sourceReadonly.primaryRendererByView()[view])
  })
  const interactionCapabilities = computed<InteractionCapabilities>(() => {
    const supportsKLineInteraction = sourceReadonly.dataView() !== ChartDataViewId.TimeShare
    return Object.freeze({
      allowPan: supportsKLineInteraction,
      allowZoom: supportsKLineInteraction,
      allowVerticalScroll: supportsKLineInteraction,
      allowRightAxisScale: supportsKLineInteraction,
    })
  })

  const setDataView = (view: ChartDataView, lastBarPeriod?: string): void => {
    if (
      view === ChartDataViewId.TimeShare &&
      lastBarPeriod &&
      lastBarPeriod !== ChartDataViewId.TimeShare
    ) {
      signals.lastBarPeriod.set(lastBarPeriod)
    }
    if (signals.dataView.peek() === view) return
    signals.dataView.set(view)
  }

  return {
    readonly: {
      ...sourceReadonly,
      /** 兼容现有 Controller API；与 dataView 指向同一只读 Signal。 */
      chartMode: sourceReadonly.dataView,
      effectivePrimaryRenderer,
      interactionCapabilities,
    },
    actions: {
      setDataView,
      setChartMode: setDataView,
      setLastBarPeriod(period: string): void {
        if (!period || period === ChartDataViewId.TimeShare || signals.lastBarPeriod.peek() === period)
          return
        signals.lastBarPeriod.set(period)
      },
      setPrimaryRenderer(view: ChartDataView, renderer: PrimaryRendererType): void {
        const current = signals.primaryRendererByView.peek()
        if (current[view] === renderer) return
        signals.primaryRendererByView.set(
          snapshotPrimaryRenderers({ ...current, [view]: renderer }),
        )
      },
    },
    dispose(): void {
      batch(() => {
        signals.dataView.set(ChartDataViewId.KLine)
        signals.lastBarPeriod.set('daily')
        signals.primaryRendererByView.set(DEFAULT_PRIMARY_RENDERERS)
      })
    },
  }
}

export type ModeStateModule = ReturnType<typeof createModeState>
