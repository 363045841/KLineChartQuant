import { createSubState, type ReadonlySignal } from '../../foundation/reactivity/signal'
import { zoomLevelToKWidth, kGapFromKWidth } from '../utils/zoom'

export interface ZoomDeps {
  dpr$: ReadonlySignal<number>
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

export function createZoomState(deps: ZoomDeps) {
  const { signals, readonly } = createSubState(
    {
      zoomLevel: 1,
    },
    {
      kWidth: (s) =>
        zoomLevelToKWidth(s.zoomLevel(), readZoomConfig(deps)),
      kGap: (s) => {
        const config = readZoomConfig(deps)
        const kw = zoomLevelToKWidth(s.zoomLevel(), config)
        return kGapFromKWidth(kw, deps.dpr$())
      },
    },
  )

  return {
    readonly,

    actions: {
      setZoomLevel(level: number) {
        signals.zoomLevel.set(level)
      },
    },

    dispose() {
      signals.zoomLevel.set(1)
    },
  }
}

export type ZoomStateModule = ReturnType<typeof createZoomState>