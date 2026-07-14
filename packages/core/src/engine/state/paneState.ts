import { batch, createSubState } from '../../foundation/reactivity/signal'
import type { PaneSpec } from '../chartTypes'

export function createPaneState() {
  const { signals, readonly } = createSubState(
    {
      paneRatios: {} as Record<string, number>,
      paneSpecs: [] as PaneSpec[],
    },
  )

  return {
    readonly,

    actions: {
      setPaneRatios(ratios: Record<string, number>) {
        signals.paneRatios.set(ratios)
      },

      setPaneSpecs(specs: PaneSpec[]) {
        signals.paneSpecs.set(specs)
      },
    },

    dispose() {
      batch(() => {
        signals.paneRatios.set({})
        signals.paneSpecs.set([])
      })
    },
  }
}

export type PaneStateModule = ReturnType<typeof createPaneState>