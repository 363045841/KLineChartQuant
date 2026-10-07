/** 数据协调层状态：当前 spec、可恢复视口位置与增量加载批次。 */

import type { SymbolSpec } from '../../controllers/types.js'
import { batch, createSubState } from '../../foundation/reactivity/signal.js'
import type { LayoutViewportSnapshot } from '../layout/index.js'

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
      viewportSnapshots: Object.freeze({}) as Readonly<Record<string, LayoutViewportSnapshot>>,
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
      /** 原子恢复文档携带的视口索引，不改变当前行情品种。 */
      restoreViewportSnapshots(snapshots: Readonly<Record<string, LayoutViewportSnapshot>>): void {
        signals.viewportSnapshots.set(Object.freeze(structuredClone(snapshots)))
      },
      setCurrentSpec(spec: SymbolSpec | null) {
        signals.currentSpec.set(spec)
      },

      saveViewportSnapshot(key: string, snapshot: LayoutViewportSnapshot) {
        signals.viewportSnapshots.set(
          Object.freeze({
            ...signals.viewportSnapshots.peek(),
            [key]: Object.freeze({ ...snapshot }),
          }),
        )
      },

      getViewportSnapshot(key: string): LayoutViewportSnapshot | null {
        return signals.viewportSnapshots.peek()[key] ?? null
      },

      consumeViewportSnapshot(key: string): LayoutViewportSnapshot | null {
        const snapshots = signals.viewportSnapshots.peek()
        const snapshot = snapshots[key]
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
