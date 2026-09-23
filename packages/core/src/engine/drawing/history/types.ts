import type { ReadonlySignal } from '../../../foundation/reactivity/signal.js'
import type { DrawingObject } from '../types.js'

export interface DrawingDocumentSnapshot {
  readonly drawings: ReadonlyArray<DrawingObject>
  readonly selectedIds: ReadonlyArray<string>
}

export interface DrawingHistoryDocumentPort {
  snapshot(): DrawingDocumentSnapshot
  onDrawingsChanged(listener: () => void): () => void
  restoreSnapshot(drawings: ReadonlyArray<DrawingObject>, selectedIds: ReadonlyArray<string>): void
}

export interface DrawingHistoryPort {
  readonly canUndo: ReadonlySignal<boolean>
  readonly canRedo: ReadonlySignal<boolean>
  run<T>(action: () => T): T
  undo(): boolean
  redo(): boolean
  reset(): void
  dispose(): void
}
