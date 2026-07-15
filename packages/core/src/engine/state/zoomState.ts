import { batch, createSubState, type ReadonlySignal } from '../../foundation/reactivity/signal'
import { zoomLevelToKWidth } from '../utils/zoom'

export interface ZoomDeps {
  minKWidth$: ReadonlySignal<number>
  maxKWidth$: ReadonlySignal<number>
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
      kWidthOverride: null as number | null,
    },
    {
      kWidth: (s) => {
        const override = s.kWidthOverride()
        if (override !== null) return override
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
          signals.kWidthOverride.set(null)
        })
      },

      setDirectKWidth(kWidth: number) {
        if (!Number.isFinite(kWidth) || kWidth <= 0) return
        signals.kWidthOverride.set(kWidth)
      },

      clearDirectKWidth() {
        signals.kWidthOverride.set(null)
      },
    },

    dispose() {
      batch(() => {
        signals.zoomLevel.set(1)
        signals.kWidthOverride.set(null)
      })
    },
  }
}

export type ZoomStateModule = ReturnType<typeof createZoomState>
