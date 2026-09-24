import { createSignal, type ReadonlySignal } from '@/foundation/reactivity/signal.js'
import type { DrawingObject } from '../../types.js'
import type {
  DrawingDocumentSnapshot,
  DrawingHistoryDocumentPort,
  DrawingHistoryPort,
} from '../types.js'

interface DrawingChange {
  readonly before: ReadonlyArray<DrawingObject>
  readonly after: ReadonlyArray<DrawingObject>
  readonly orderBefore: ReadonlyArray<string>
  readonly orderAfter: ReadonlyArray<string>
  readonly selectionBefore: ReadonlyArray<string>
  readonly selectionAfter: ReadonlyArray<string>
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return false
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => sameValue(item, right[index]))
    )
  }
  const a = left as Record<string, unknown>
  const b = right as Record<string, unknown>
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && sameValue(a[key], b[key]))
  )
}

function getChange(
  before: DrawingDocumentSnapshot,
  after: DrawingDocumentSnapshot,
): DrawingChange | null {
  const previous = new Map(before.drawings.map((drawing) => [drawing.id, drawing]))
  const next = new Map(after.drawings.map((drawing) => [drawing.id, drawing]))
  const ids = new Set([...previous.keys(), ...next.keys()])
  const changed = new Set([...ids].filter((id) => !sameValue(previous.get(id), next.get(id))))
  const orderBefore = before.drawings.map((drawing) => drawing.id)
  const orderAfter = after.drawings.map((drawing) => drawing.id)
  if (changed.size === 0 && sameValue(orderBefore, orderAfter)) return null
  return {
    before: before.drawings.filter((drawing) => changed.has(drawing.id)),
    after: after.drawings.filter((drawing) => changed.has(drawing.id)),
    orderBefore,
    orderAfter,
    selectionBefore: before.selectedIds,
    selectionAfter: after.selectedIds,
  }
}

/** 每张图表一条历史；仅存变化对象和完整 ID 顺序，不复制未修改的图元模型。 */
export class DrawingHistory implements DrawingHistoryPort {
  private readonly undoStack: DrawingChange[] = []
  private readonly redoStack: DrawingChange[] = []
  private readonly canUndoSignal = createSignal(false)
  private readonly canRedoSignal = createSignal(false)
  readonly canUndo: ReadonlySignal<boolean> = this.canUndoSignal
  readonly canRedo: ReadonlySignal<boolean> = this.canRedoSignal
  private writing = false
  private expected: ReadonlyArray<DrawingObject>
  private readonly unsubscribe: () => void

  constructor(
    private readonly document: DrawingHistoryDocumentPort,
    private readonly requestDraw: () => void,
    private readonly limit = 100,
  ) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError('Drawing history limit must be positive')
    }
    this.expected = document.snapshot().drawings
    this.unsubscribe = document.onDrawingsChanged(() => {
      if (!this.writing) this.reset()
    })
  }

  private publish(): void {
    this.canUndoSignal.set(this.undoStack.length > 0)
    this.canRedoSignal.set(this.redoStack.length > 0)
  }

  private isCurrent(): boolean {
    if (this.expected === this.document.snapshot().drawings) return true
    this.reset()
    return false
  }

  run<T>(action: () => T): T {
    if (this.writing) throw new Error('Nested drawing mutation is not supported')
    this.isCurrent()
    const before = this.document.snapshot()
    this.writing = true
    let result: T
    try {
      result = action()
    } catch (error) {
      if (this.document.snapshot().drawings !== before.drawings) {
        try {
          this.document.restoreSnapshot(before.drawings, before.selectedIds)
          this.requestDraw()
        } catch {
          // If rollback itself fails, never replay history against an unknown document.
          this.reset()
        }
        this.expected = this.document.snapshot().drawings
      }
      throw error
    } finally {
      this.writing = false
    }
    const after = this.document.snapshot()
    this.expected = after.drawings
    const change = getChange(before, after)
    if (change) {
      this.undoStack.push(change)
      if (this.undoStack.length > this.limit) this.undoStack.shift()
      this.redoStack.length = 0
      this.publish()
      this.requestDraw()
    }
    return result
  }

  private replay(
    source: DrawingChange[],
    destination: DrawingChange[],
    backwards: boolean,
  ): boolean {
    if (!this.isCurrent() || source.length === 0) return false
    const change = source[source.length - 1]!
    const removed = backwards ? change.after : change.before
    const inserted = backwards ? change.before : change.after
    const order = backwards ? change.orderBefore : change.orderAfter
    const selection = backwards ? change.selectionBefore : change.selectionAfter
    const byId = new Map(this.document.snapshot().drawings.map((drawing) => [drawing.id, drawing]))
    for (const drawing of removed) byId.delete(drawing.id)
    for (const drawing of inserted) byId.set(drawing.id, drawing)
    if (byId.size !== order.length || order.some((id) => !byId.has(id))) {
      this.reset()
      return false
    }
    this.writing = true
    try {
      this.document.restoreSnapshot(
        order.map((id) => byId.get(id)!),
        selection,
      )
    } catch (error) {
      this.reset()
      throw error
    } finally {
      this.writing = false
    }
    this.expected = this.document.snapshot().drawings
    source.pop()
    destination.push(change)
    this.publish()
    this.requestDraw()
    return true
  }

  undo(): boolean {
    return this.replay(this.undoStack, this.redoStack, true)
  }

  redo(): boolean {
    return this.replay(this.redoStack, this.undoStack, false)
  }

  /** 外部权威数据替换或工作区重置时，当前文档成为新基线。 */
  reset(): void {
    this.undoStack.length = 0
    this.redoStack.length = 0
    this.expected = this.document.snapshot().drawings
    this.publish()
  }

  dispose(): void {
    this.unsubscribe()
    this.reset()
  }
}
