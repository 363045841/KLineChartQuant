import { createSubState } from '../../foundation/reactivity/signal'

export function createComparisonState() {
  const { signals, readonly } = createSubState({
    colors: new Map<string, string>() as ReadonlyMap<string, string>,
    loading: false,
  })

  return {
    readonly,
    actions: {
      setColors(colors: ReadonlyMap<string, string>) {
        signals.colors.set(colors)
      },
      setLoading(loading: boolean) {
        signals.loading.set(loading)
      },
    },
    dispose() {
      signals.colors.set(new Map())
      signals.loading.set(false)
    },
  }
}

export type ComparisonStateModule = ReturnType<typeof createComparisonState>
