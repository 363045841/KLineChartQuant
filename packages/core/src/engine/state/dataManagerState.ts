import { batch, createSubState } from '../../foundation/reactivity/signal'
import type { SymbolSpec } from '../../controllers/types'

export interface IncrementalLoadBatch {
  readonly count: number
  readonly leftBufferWidth: number
}

/** 单个数据视图的可恢复横向位置。 */
export interface ViewportSnapshot {
  readonly anchorTimestamp: number
  readonly anchorOffsetPx: number
  readonly zoomLevel: number
}

function emptyIncrementalLoadBatch(): IncrementalLoadBatch {
  return { count: 0, leftBufferWidth: 0 }
}

export function createDataManagerState() {
  const { signals, readonly } = createSubState(
    {
      currentSpec: null as SymbolSpec | null,
      viewportSnapshots: Object.freeze({}) as Readonly<Record<string, ViewportSnapshot>>,
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

      saveViewportSnapshot(key: string, snapshot: ViewportSnapshot) {
        if (!key || !Number.isFinite(snapshot.anchorTimestamp)) return
        signals.viewportSnapshots.set(
          Object.freeze({
            ...signals.viewportSnapshots.peek(),
            [key]: Object.freeze({ ...snapshot }),
          }),
        )
      },

      getViewportSnapshot(key: string): ViewportSnapshot | null {
        return signals.viewportSnapshots.peek()[key] ?? null
      },

      consumeViewportSnapshot(key: string): ViewportSnapshot | null {
        const snapshots = signals.viewportSnapshots.peek()
        const snapshot = snapshots[key] ?? null
        if (!snapshot) return null
        const { [key]: _, ...remaining } = snapshots
        signals.viewportSnapshots.set(Object.freeze(remaining))
        return snapshot
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
          signals.viewportSnapshots.set(Object.freeze({}))
          signals.rangeInitialized.set(false)
          signals.pendingIncrementalLoad.set(emptyIncrementalLoadBatch())
        })
      },
    },

    dispose() {
      batch(() => {
        signals.currentSpec.set(null)
        signals.viewportSnapshots.set(Object.freeze({}))
        signals.rangeInitialized.set(false)
        signals.pendingIncrementalLoad.set(emptyIncrementalLoadBatch())
      })
    },
  }
}

export type DataManagerStateModule = ReturnType<typeof createDataManagerState>
