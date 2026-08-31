/** 缩放状态模块：缩放级别到 kWidth 的派生与 clamp。 */
import { batch, createSubState, type ReadonlySignal } from '../../foundation/reactivity/signal'
import { isTimeShareDataView, type ChartDataView } from './modeState'
import { zoomLevelToKWidth } from '../utils/zoom'

export interface ZoomDeps {
  minKWidth$: ReadonlySignal<number>
  maxKWidth$: ReadonlySignal<number>
  dataView$: ReadonlySignal<ChartDataView>
  zoomLevelCount: number
}

function readZoomConfig(deps: ZoomDeps) {
  return {
    minKWidth: deps.minKWidth$(),
    maxKWidth: deps.maxKWidth$(),
    zoomLevelCount: deps.zoomLevelCount,
  }
}

function clampZoomLevel(level: number, zoomLevelCount: number): number {
  const count = Math.max(2, Math.round(zoomLevelCount))
  const rounded = Number.isFinite(level) ? Math.round(level) : 1
  return Math.max(1, Math.min(count, rounded))
}

export function createZoomState(deps: ZoomDeps) {
  const { signals, readonly } = createSubState(
    {
      zoomLevel: 1,
      timeShareKWidth: null as number | null,
      timeShareSlotWidth: null as number | null,
    },
    {
      kWidth: (s) => {
        const timeShareWidth = s.timeShareKWidth()
        if (isTimeShareDataView(deps.dataView$()) && timeShareWidth !== null) return timeShareWidth
        return zoomLevelToKWidth(s.zoomLevel(), readZoomConfig(deps))
      },
    },
  )

  return {
    readonly,

    actions: {
      setZoomLevel(level: number) {
        const clamped = clampZoomLevel(level, deps.zoomLevelCount)
        batch(() => {
          signals.zoomLevel.set(clamped)
        })
      },

      setTimeShareKWidth(kWidth: number) {
        if (!Number.isFinite(kWidth) || kWidth <= 0) return
        signals.timeShareKWidth.set(kWidth)
      },

      /** 设置分时每个交易槽的逻辑宽度。 */
      setTimeShareSlotWidth(width: number) {
        if (!Number.isFinite(width) || width <= 0) return
        signals.timeShareSlotWidth.set(width)
      },

      clearTimeShareKWidth() {
        batch(() => {
          signals.timeShareKWidth.set(null)
          signals.timeShareSlotWidth.set(null)
        })
      },
    },

    dispose() {
      batch(() => {
        signals.zoomLevel.set(1)
        signals.timeShareKWidth.set(null)
        signals.timeShareSlotWidth.set(null)
      })
    },
  }
}

export type ZoomStateModule = ReturnType<typeof createZoomState>
