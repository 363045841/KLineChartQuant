import { createSubState, batch } from '../../foundation/reactivity/signal'
import { freezeRecord, immutableMap } from './immutable'

export type MainIndicatorEntry = {
  readonly params: Readonly<Record<string, number | boolean | string>>
}

function snapshotEntry(params: Record<string, number | boolean | string>): MainIndicatorEntry {
  return Object.freeze({
    params: freezeRecord(params),
  })
}

function snapshotMap(
  entries: ReadonlyMap<string, MainIndicatorEntry | { params: Record<string, number | boolean | string> }>,
): ReadonlyMap<string, MainIndicatorEntry> {
  const next = new Map<string, MainIndicatorEntry>()
  for (const [id, entry] of entries) {
    next.set(id, snapshotEntry({ ...entry.params }))
  }
  return immutableMap(next)
}

export function createIndicatorState() {
  const { signals, readonly } = createSubState({
    mainIndicators: immutableMap(new Map<string, MainIndicatorEntry>()),
  })

  const write = (
    next: ReadonlyMap<string, MainIndicatorEntry | { params: Record<string, number | boolean | string> }>,
  ) => {
    signals.mainIndicators.set(snapshotMap(next))
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
      replaceAll(entries: ReadonlyMap<string, MainIndicatorEntry | { params: Record<string, number | boolean | string> }>) {
        write(entries)
      },
      clear() {
        write(new Map())
      },
    },
    dispose() {
      batch(() => {
        signals.mainIndicators.set(immutableMap(new Map()))
      })
    },
  }
}

export type IndicatorStateModule = ReturnType<typeof createIndicatorState>
