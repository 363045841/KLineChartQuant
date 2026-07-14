import { batch, createSubState } from '../../foundation/reactivity/signal'
import type { PaneSpec } from '../chartTypes'

function copyRatios(ratios: Readonly<Record<string, number>>): Record<string, number> {
  return { ...ratios }
}

function copySpecs(specs: ReadonlyArray<PaneSpec>): PaneSpec[] {
  return specs.map((spec) => ({
    ...spec,
    ...(spec.capabilities ? { capabilities: { ...spec.capabilities } } : {}),
  }))
}

export function createPaneState() {
  const { signals, readonly } = createSubState({
    paneRatios: {} as Record<string, number>,
    paneSpecs: [] as PaneSpec[],
  })

  return {
    readonly,

    actions: {
      setPaneRatios(ratios: Record<string, number>) {
        signals.paneRatios.set(copyRatios(ratios))
      },

      setPaneSpecs(specs: PaneSpec[]) {
        signals.paneSpecs.set(copySpecs(specs))
      },

      /** ratios 与 specs 同批发布，避免中间态 */
      commitLayout(ratios: Readonly<Record<string, number>>, specs: ReadonlyArray<PaneSpec>) {
        batch(() => {
          signals.paneRatios.set(copyRatios(ratios))
          signals.paneSpecs.set(copySpecs(specs))
        })
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
