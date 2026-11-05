/** 图表选项状态：分辨率化选项快照；K 线几何尺寸由视口派生，不属于选项。 */
import { createSubState } from '../../foundation/reactivity/signal.js'
import type { ChartOptions } from '../chart/index.js'

type ResolvedChartOptions = ChartOptions & { zoomLevelCount: number }

export function createOptionsState(initial: ResolvedChartOptions) {
  const { signals, readonly } = createSubState({
    options: initial,
  })

  return {
    readonly,
    actions: {
      patch(partial: Partial<ResolvedChartOptions>) {
        signals.options.set({ ...signals.options.peek(), ...partial })
      },
      replace(next: ResolvedChartOptions) {
        signals.options.set(next)
      },
    },
    dispose() {
      signals.options.set(initial)
    },
  }
}

export type OptionsStateModule = ReturnType<typeof createOptionsState>
