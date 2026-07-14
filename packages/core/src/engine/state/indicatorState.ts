import { createSubState, batch } from '../../foundation/reactivity/signal'

export type MainIndicatorEntry = {
  params: Record<string, number | boolean | string>
}

export function createIndicatorState() {
  const { signals, readonly } = createSubState({
    mainIndicators: new Map<string, MainIndicatorEntry>() as ReadonlyMap<
      string,
      MainIndicatorEntry
    >,
  })

  const write = (next: Map<string, MainIndicatorEntry>) => {
    signals.mainIndicators.set(next)
  }

  return {
    readonly,
    actions: {
      upsert(id: string, params: Record<string, number | boolean | string>) {
        const key = id.toUpperCase()
        const prev = signals.mainIndicators.peek()
        const existing = prev.get(key)
        const next = new Map(prev)
        next.set(key, {
          params: existing ? { ...existing.params, ...params } : { ...params },
        })
        write(next)
      },
      remove(id: string) {
        const key = id.toUpperCase()
        const prev = signals.mainIndicators.peek()
        if (!prev.has(key)) return
        const next = new Map(prev)
        next.delete(key)
        write(next)
      },
      setParams(id: string, params: Record<string, number | boolean | string>) {
        const key = id.toUpperCase()
        const prev = signals.mainIndicators.peek()
        const existing = prev.get(key)
        if (!existing) return
        const next = new Map(prev)
        next.set(key, { params: { ...existing.params, ...params } })
        write(next)
      },
      replaceAll(entries: ReadonlyMap<string, MainIndicatorEntry>) {
        write(new Map(entries))
      },
      clear() {
        write(new Map())
      },
    },
    dispose() {
      batch(() => {
        signals.mainIndicators.set(new Map())
      })
    },
  }
}

export type IndicatorStateModule = ReturnType<typeof createIndicatorState>
