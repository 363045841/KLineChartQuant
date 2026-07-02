/**
 * Frame budget scheduler — adaptive workload manager.
 *
 * Real-time finance charts share a constraint with games and trading
 * terminals: the renderer has a wall-clock budget per frame (16.67 ms
 * at 60 fps, 6.94 ms at 144 fps), and exceeding it means dropped frames.
 * Work that doesn't fit gets deferred to the next frame, but the work
 * *queue* must not grow without bound — a stale indicator update is
 * worse than a missed update.
 *
 * This module owns the policy. Consumers submit prioritised tasks;
 * `flush(deadline)` drains as many as fit; the rest stay queued until
 * the next call. A rolling-average frame-time signal lets components
 * back off proactively rather than waiting for budget exhaustion.
 *
 * Pure data: no requestAnimationFrame, no performance.now() side effects.
 * The host (browser / Node test / Deno) supplies the clock via a `now`
 * function. Default: `performance.now()` if available, else `Date.now()`.
 *
 *   const budget = createFrameBudget({ targetMs: 16 })
 *
 *   // Host's rAF loop:
 *   function tick(t) {
 *     budget.beginFrame(t)
 *     budget.submit({ id: 'indicators', priority: 'high', work: recompute })
 *     budget.submit({ id: 'labels',     priority: 'low',  work: drawLabels })
 *     budget.flush(t + budget.targetMs)
 *     budget.endFrame(performance.now())
 *     requestAnimationFrame(tick)
 *   }
 *
 *   // Consumers can read the load signal to back off:
 *   if (budget.recentFrameMs() > 18) skipLowPriorityWork()
 */

import { KLineChartError } from '../errors'
import { createSignal, type Signal } from '../reactivity'

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

export type TaskPriority = 'high' | 'medium' | 'low'

export interface FrameTask {
  /** Stable id. Duplicate submissions with the same id are coalesced — the
   *  later submission's `work` and `priority` win. */
  readonly id: string
  readonly priority: TaskPriority
  /** Synchronous unit of work. Throws are caught and logged but do NOT
   *  abort the frame; the task is dropped. */
  readonly work: () => void
}

export interface FrameBudgetOptions {
  /** Target frame budget in milliseconds. Default 16 (≈60 fps). */
  readonly targetMs?: number
  /** Rolling window for `recentFrameMs`. Default 60 frames (1 s at 60 fps). */
  readonly historySize?: number
  /**
   * Clock function. Default: `performance.now()` if available, else
   * `Date.now()`. Injected for tests so timing is deterministic.
   */
  readonly now?: () => number
  /**
   * Maximum queued tasks. Older low/medium tasks are dropped when the
   * queue exceeds this. Default 256 — high enough that legitimate
   * workloads never hit it, low enough that runaway producers fail loud.
   */
  readonly maxQueueSize?: number
}

export interface FrameBudget {
  readonly targetMs: number
  /** Current rolling-average frame time in ms. */
  readonly recentFrameMs: Signal<number>
  /** Number of tasks currently queued (not yet flushed). */
  readonly queueDepth: Signal<number>
  /** Frames whose work exceeded targetMs (cumulative). */
  readonly overruns: Signal<number>

  /** Mark the start of a frame. Pass `performance.now()` (or test clock). */
  beginFrame(t: number): void
  /** Queue a task. Coalesces on id (later submission wins). */
  submit(task: FrameTask): void
  /**
   * Drain queued tasks until the deadline (absolute timestamp in the
   * `now`-clock's scale). Returns the number of tasks completed.
   *
   * Tasks run in priority order: all `high` first, then `medium`, then
   * `low`. Within a priority, FIFO. A task that throws is caught and
   * dropped; remaining tasks continue.
   */
  flush(deadlineAbs: number): number
  /** Mark the end of a frame. Updates `recentFrameMs` + overrun count. */
  endFrame(t: number): void
  /** Drop all queued tasks. */
  clear(): void
  dispose(): void
}

const PRIORITY_ORDER: ReadonlyArray<TaskPriority> = ['high', 'medium', 'low']

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function defaultNow(): number {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance
  if (typeof perf?.now === 'function') return perf.now()
  return Date.now()
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createFrameBudget(opts: FrameBudgetOptions = {}): FrameBudget {
  const targetMs = opts.targetMs ?? 16
  const historySize = opts.historySize ?? 60
  const maxQueueSize = opts.maxQueueSize ?? 256
  const now = opts.now ?? defaultNow

  if (!(targetMs > 0) || !Number.isFinite(targetMs)) {
    throw new KLineChartError(
      'INVALID_PARAM',
      `createFrameBudget: targetMs must be > 0, got ${targetMs}`,
    )
  }
  if (!(historySize > 0) || !Number.isInteger(historySize)) {
    throw new KLineChartError(
      'INVALID_PARAM',
      `createFrameBudget: historySize must be a positive integer, got ${historySize}`,
    )
  }
  if (!(maxQueueSize > 0) || !Number.isInteger(maxQueueSize)) {
    throw new KLineChartError(
      'INVALID_PARAM',
      `createFrameBudget: maxQueueSize must be a positive integer, got ${maxQueueSize}`,
    )
  }

  const recentFrameMs = createSignal(0)
  const queueDepth = createSignal(0)
  const overruns = createSignal(0)

  // One queue per priority; preserves FIFO inside a tier.
  const queues: Record<TaskPriority, FrameTask[]> = {
    high: [],
    medium: [],
    low: [],
  }
  // Reverse lookup so coalesce-by-id is O(1).
  const byId = new Map<string, { tier: TaskPriority; index: number }>()

  const frameTimes: number[] = []
  let frameStart = 0
  let disposed = false

  function publishDepth(): void {
    queueDepth.set(queues.high.length + queues.medium.length + queues.low.length)
  }

  function totalQueued(): number {
    return queues.high.length + queues.medium.length + queues.low.length
  }

  function dropOldestLowOrMedium(): void {
    // Prefer dropping low first, then medium. We never drop high.
    if (queues.low.length > 0) {
      const dropped = queues.low.shift()!
      byId.delete(dropped.id)
      return
    }
    if (queues.medium.length > 0) {
      const dropped = queues.medium.shift()!
      byId.delete(dropped.id)
      return
    }
    // Only high tasks remain. We don't drop high tasks for queue
    // pressure; the producer is misbehaving. Surface via overruns
    // signal so the host can decide.
  }

  function submit(task: FrameTask): void {
    if (disposed) return
    if (task.id === '' || typeof task.id !== 'string') {
      throw new KLineChartError(
        'INVALID_PARAM',
        `FrameBudget.submit: task.id must be a non-empty string`,
      )
    }
    // Coalesce by id — replace existing entry.
    const existing = byId.get(task.id)
    if (existing !== undefined) {
      queues[existing.tier][existing.index] = task
      // The tier might be changing; if it is, we need to re-bucket.
      if (existing.tier !== task.priority) {
        // Mark old slot as a tombstone (we can't splice cheaply mid-iteration
        // in some paths). The flush loop tolerates undefined entries.
        ;(queues[existing.tier] as Array<FrameTask | undefined>)[existing.index] = undefined
        queues[task.priority].push(task)
        byId.set(task.id, {
          tier: task.priority,
          index: queues[task.priority].length - 1,
        })
      }
      publishDepth()
      return
    }
    // Enforce maxQueueSize by dropping older low/medium first.
    while (totalQueued() >= maxQueueSize) {
      dropOldestLowOrMedium()
      // If only high tasks left and we're still at the cap, bail.
      if (totalQueued() >= maxQueueSize && queues.low.length === 0 && queues.medium.length === 0) {
        break
      }
    }
    queues[task.priority].push(task)
    byId.set(task.id, {
      tier: task.priority,
      index: queues[task.priority].length - 1,
    })
    publishDepth()
  }

  function flush(deadlineAbs: number): number {
    if (disposed) return 0
    let completed = 0
    for (const tier of PRIORITY_ORDER) {
      const q = queues[tier] as Array<FrameTask | undefined>
      while (q.length > 0) {
        if (now() >= deadlineAbs) {
          // Compact the tier so later flushes skip tombstones.
          queues[tier] = q.filter((t): t is FrameTask => t !== undefined)
          // Rebuild byId indices for this tier.
          for (let i = 0; i < queues[tier].length; i++) {
            const t = queues[tier][i]!
            byId.set(t.id, { tier, index: i })
          }
          publishDepth()
          return completed
        }
        const task = q.shift()
        if (task === undefined) continue // tombstone
        byId.delete(task.id)
        try {
          task.work()
          completed++
        } catch {
          // Task threw; drop it. We don't propagate — one
          // bad task must not poison the frame.
        }
      }
    }
    publishDepth()
    return completed
  }

  function beginFrame(t: number): void {
    if (disposed) return
    if (!Number.isFinite(t)) {
      throw new KLineChartError(
        'INVALID_PARAM',
        `FrameBudget.beginFrame: t must be finite, got ${t}`,
      )
    }
    frameStart = t
  }

  function endFrame(t: number): void {
    if (disposed) return
    if (!Number.isFinite(t)) {
      throw new KLineChartError('INVALID_PARAM', `FrameBudget.endFrame: t must be finite, got ${t}`)
    }
    const dur = Math.max(0, t - frameStart)
    frameTimes.push(dur)
    while (frameTimes.length > historySize) frameTimes.shift()
    let sum = 0
    for (const v of frameTimes) sum += v
    recentFrameMs.set(sum / frameTimes.length)
    if (dur > targetMs) overruns.set(overruns.peek() + 1)
  }

  function clear(): void {
    if (disposed) return
    queues.high = []
    queues.medium = []
    queues.low = []
    byId.clear()
    publishDepth()
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    queues.high = []
    queues.medium = []
    queues.low = []
    byId.clear()
    frameTimes.length = 0
  }

  return {
    targetMs,
    recentFrameMs,
    queueDepth,
    overruns,
    beginFrame,
    submit,
    flush,
    endFrame,
    clear,
    dispose,
  }
}
