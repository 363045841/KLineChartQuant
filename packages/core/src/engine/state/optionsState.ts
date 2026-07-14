import { createSubState } from '../../foundation/reactivity/signal'
import type { ChartOptions } from '../chartTypes'

type ResolvedChartOptions = Omit<ChartOptions, 'kWidth' | 'kGap'> & { zoomLevelCount: number }

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
