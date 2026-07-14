import { batch, createSubState } from '../../foundation/reactivity/signal'
import { immutableMap } from './immutable'

export function createComparisonState() {
  const { signals, readonly } = createSubState({
    colors: immutableMap(new Map<string, string>()),
    loading: false,
  })

  return {
    readonly,
    actions: {
      setColors(colors: ReadonlyMap<string, string>) {
        signals.colors.set(immutableMap(colors))
      },
      setLoading(loading: boolean) {
        signals.loading.set(loading)
      },
    },
    dispose() {
      batch(() => {
        signals.colors.set(immutableMap(new Map()))
        signals.loading.set(false)
      })
    },
  }
}

export type ComparisonStateModule = ReturnType<typeof createComparisonState>
