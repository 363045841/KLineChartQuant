import { batch, createSubState } from '../../foundation/reactivity/signal'
import { deepFreezeSnapshot } from './immutable'

export interface SubPaneSpec {
  readonly paneId: string
  readonly indicatorId: string
  readonly params: Readonly<Record<string, unknown>>
}

function snapshotEntry(entry: {
  paneId: string
  indicatorId: string
  params: Readonly<Record<string, unknown>>
}): SubPaneSpec {
  return Object.freeze({
    paneId: entry.paneId,
    indicatorId: entry.indicatorId,
    params: deepFreezeSnapshot(entry.params),
  })
}

function entriesEqual(left: SubPaneSpec, right: SubPaneSpec): boolean {
  if (left.paneId !== right.paneId || left.indicatorId !== right.indicatorId) return false
  const leftKeys = Object.keys(left.params)
  const rightKeys = Object.keys(right.params)
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.is(left.params[key], right.params[key]))
  )
}

function snapshotEntries(entries: ReadonlyArray<SubPaneSpec>): ReadonlyArray<SubPaneSpec> {
  return Object.freeze(entries.map(snapshotEntry))
}

export function createSubPaneState() {
  const { signals, readonly } = createSubState({
    entries: Object.freeze([]) as ReadonlyArray<SubPaneSpec>,
  })

  const write = (entries: ReadonlyArray<SubPaneSpec>) => {
    signals.entries.set(snapshotEntries(entries))
  }

  return {
    readonly,
    actions: {
      upsert(entry: SubPaneSpec) {
        const prev = signals.entries.peek()
        const index = prev.findIndex((item) => item.paneId === entry.paneId)
        const nextEntry = snapshotEntry(entry)
        if (index >= 0 && entriesEqual(prev[index]!, nextEntry)) return
        if (index < 0) {
          write([...prev, nextEntry])
          return
        }
        const next = [...prev]
        next[index] = nextEntry
        write(next)
      },
      remove(paneId: string) {
        const prev = signals.entries.peek()
        if (!prev.some((entry) => entry.paneId === paneId)) return
        write(prev.filter((entry) => entry.paneId !== paneId))
      },
      setParams(paneId: string, params: Readonly<Record<string, unknown>>) {
        const prev = signals.entries.peek()
        const entry = prev.find((item) => item.paneId === paneId)
        if (!entry) return
        write(prev.map((item) => (item.paneId === paneId ? { ...entry, params } : item)))
      },
      replace(entry: SubPaneSpec) {
        const prev = signals.entries.peek()
        if (!prev.some((item) => item.paneId === entry.paneId)) return
        write(prev.map((item) => (item.paneId === entry.paneId ? entry : item)))
      },
      replaceAll(entries: ReadonlyArray<SubPaneSpec>) {
        write(entries)
      },
      clear() {
        if (signals.entries.peek().length > 0) write([])
      },
    },
    dispose() {
      batch(() => {
        signals.entries.set(Object.freeze([]))
      })
    },
  }
}

export type SubPaneStateModule = ReturnType<typeof createSubPaneState>
