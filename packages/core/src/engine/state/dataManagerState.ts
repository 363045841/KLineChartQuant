import { batch, createSubState } from '../../foundation/reactivity/signal'
import type { SymbolSpec } from '../../controllers/types'

export interface IncrementalLoadBatch {
  readonly count: number
  readonly leftBufferWidth: number
}

function emptyIncrementalLoadBatch(): IncrementalLoadBatch {
  return { count: 0, leftBufferWidth: 0 }
}

export function createDataManagerState() {
  const { signals, readonly } = createSubState(
    {
      currentSpec: null as SymbolSpec | null,
      savedScrollTimestamp: null as number | null,
      preCustomSpec: null as SymbolSpec | null,
      rangeInitialized: false,
      pendingIncrementalLoad: emptyIncrementalLoadBatch(),
    },
    {
      currentPeriod: (s) => s.currentSpec()?.period ?? 'daily',
    },
  )

  return {
    readonly,

    actions: {
      setCurrentSpec(spec: SymbolSpec | null) {
        signals.currentSpec.set(spec)
      },

      setSavedScrollTimestamp(ts: number | null) {
        signals.savedScrollTimestamp.set(ts)
      },

      setPreCustomSpec(spec: SymbolSpec | null) {
        signals.preCustomSpec.set(spec)
      },

      setRangeInitialized(v: boolean) {
        signals.rangeInitialized.set(v)
      },

      recordIncrementalLoad(count: number, leftBufferWidth: number) {
        const pending = signals.pendingIncrementalLoad.peek()
        signals.pendingIncrementalLoad.set({
          count: pending.count + count,
          leftBufferWidth,
        })
      },

      flushIncrementalLoad(): IncrementalLoadBatch {
        const pending = signals.pendingIncrementalLoad.peek()
        signals.pendingIncrementalLoad.set(emptyIncrementalLoadBatch())
        return pending
      },

      resetIncrementalLoad() {
        signals.pendingIncrementalLoad.set(emptyIncrementalLoadBatch())
      },

      reset() {
        batch(() => {
          signals.currentSpec.set(null)
          signals.savedScrollTimestamp.set(null)
          signals.preCustomSpec.set(null)
          signals.rangeInitialized.set(false)
          signals.pendingIncrementalLoad.set(emptyIncrementalLoadBatch())
        })
      },
    },

    dispose() {
      batch(() => {
        signals.currentSpec.set(null)
        signals.savedScrollTimestamp.set(null)
        signals.preCustomSpec.set(null)
        signals.rangeInitialized.set(false)
        signals.pendingIncrementalLoad.set(emptyIncrementalLoadBatch())
      })
    },
  }
}

export type DataManagerStateModule = ReturnType<typeof createDataManagerState>
