/** 各视图独立的尺寸导航状态；实际绘制尺寸由视图策略派生。 */
import {
  computed,
  createSubState,
  type ReadonlySignal,
} from '../../foundation/reactivity/signal.js'
import { type ChartDataView, ChartDataViewId } from '../../foundation/types/chartView.js'
import { clampZoomLevel, zoomLevelToKWidth } from '../utils/zoom.js'

export interface ZoomDeps {
  minKWidth$: ReadonlySignal<number>
  maxKWidth$: ReadonlySignal<number>
  dataView$: ReadonlySignal<ChartDataView>
  zoomLevelCount: number
}

/** 构造独立尺寸状态，视图切换只选择状态，不清除其他视图的导航。 */
export function createZoomState(deps: ZoomDeps) {
  const initial = {
    [ChartDataViewId.KLine]: { level: 1, slotWidth: null as number | null },
    [ChartDataViewId.Comparison]: { level: 1, slotWidth: null as number | null },
    [ChartDataViewId.TimeShare]: { level: 1, slotWidth: null as number | null },
    [ChartDataViewId.FiveDayTimeShare]: { level: 1, slotWidth: null as number | null },
  }
  const state = createSubState({ sizes: initial })
  const current = computed(() => state.readonly.sizes()[deps.dataView$()])
  const zoomLevel = computed(() => current().level)
  const timeShareSlotWidth = computed(() => current().slotWidth)
  const kWidth = computed(() =>
    zoomLevelToKWidth(zoomLevel(), {
      minKWidth: deps.minKWidth$(),
      maxKWidth: deps.maxKWidth$(),
      zoomLevelCount: deps.zoomLevelCount,
    }),
  )
  const setLevel = (level: number): void => {
    if (!Number.isFinite(level)) return
    const view = deps.dataView$.peek()
    const sizes = state.readonly.sizes.peek()
    state.signals.sizes.set({
      ...sizes,
      [view]: { ...sizes[view], level: Math.max(1, Math.min(deps.zoomLevelCount, level)) },
    })
  }
  return {
    readonly: { zoomLevel, timeShareSlotWidth, kWidth },
    actions: {
      /** 写入当前视图的合法尺寸级别。 */
      setZoomLevel(level: number): void {
        if (!Number.isFinite(level)) return
        setLevel(clampZoomLevel(level, deps.zoomLevelCount))
      },
      /** 动画帧的连续级别；仍由模型派生宽度与槽位，结束时落到完整档位。 */
      setZoomProgress: setLevel,
      /** 原子导航事务使用的交易槽宽，null 表示由策略适配初始布局。 */
      setSessionSlotWidth(width: number | null): void {
        if (width !== null && (!Number.isFinite(width) || width <= 0)) return
        const view = deps.dataView$.peek()
        const sizes = state.readonly.sizes.peek()
        state.signals.sizes.set({ ...sizes, [view]: { ...sizes[view], slotWidth: width } })
      },
    },
    /** 销毁时清除各视图状态。 */
    dispose(): void {
      state.signals.sizes.set(initial)
    },
  }
}

export type ZoomStateModule = ReturnType<typeof createZoomState>
