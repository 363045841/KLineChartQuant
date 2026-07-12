import { createSubState, batch, type ReadonlySignal } from '../../foundation/reactivity/signal'
import type { SymbolSpec } from '../../controllers/types'

export function createDataManagerState() {
  const { signals, readonly } = createSubState(
    {
      currentSpec: null as SymbolSpec | null,
      savedScrollTimestamp: null as number | null,
      preCustomSpec: null as SymbolSpec | null,
      rangeInitialized: false,
      pendingIncrementalLoadCount: 0,
      pendingIncrementalLoadLeftBufferWidth: 0,
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
        batch(() => {
          signals.pendingIncrementalLoadCount.set(
            signals.pendingIncrementalLoadCount.peek() + count,
          )
          signals.pendingIncrementalLoadLeftBufferWidth.set(leftBufferWidth)
        })
      },

      flushIncrementalLoad(): { count: number; leftBufferWidth: number } {
        const count = signals.pendingIncrementalLoadCount.peek()
        const leftBufferWidth = signals.pendingIncrementalLoadLeftBufferWidth.peek()
        signals.pendingIncrementalLoadCount.set(0)
        signals.pendingIncrementalLoadLeftBufferWidth.set(0)
        return { count, leftBufferWidth }
      },

      resetIncrementalLoad() {
        signals.pendingIncrementalLoadCount.set(0)
        signals.pendingIncrementalLoadLeftBufferWidth.set(0)
      },

      reset() {
        signals.currentSpec.set(null)
        signals.savedScrollTimestamp.set(null)
        signals.preCustomSpec.set(null)
        signals.rangeInitialized.set(false)
        signals.pendingIncrementalLoadCount.set(0)
        signals.pendingIncrementalLoadLeftBufferWidth.set(0)
      },

      dispose() {
        signals.currentSpec.set(null)
        signals.savedScrollTimestamp.set(null)
        signals.preCustomSpec.set(null)
        signals.rangeInitialized.set(false)
        signals.pendingIncrementalLoadCount.set(0)
        signals.pendingIncrementalLoadLeftBufferWidth.set(0)
      },
    },
  }
}

export type DataManagerStateModule = ReturnType<typeof createDataManagerState>
