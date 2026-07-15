/**
 * Pointer gesture recognizer — 1-pointer pan/swipe + 2-pointer pinch.
 *
 * Pure-data state machine: no DOM. Consumers feed `PointerEventLike`
 * records via `onPointerDown` / `onPointerMove` / `onPointerUp`, and
 * read recognized gestures off the `events` signal.
 *
 * The recognizer is **framework-agnostic** for the same reason as the
 * shortcut registry: every consumer touches a different event surface
 * (`PointerEvent`, `MouseEvent`, `TouchEvent`, synthetic events from a
 * Vue composable). Defining the minimal `PointerEventLike` interface
 * means none of them have to adapt to ours — they adapt to themselves
 * and hand us the four fields we need.
 *
 * State diagram (simplified):
 *
 *     idle ──[1 down]──▶ tracking (1 pointer)
 *      ▲                      │ ├──[move past deadzone]──▶ pan
 *      │                      │ ├──[up + velocity > min]──▶ swipe → idle
 *      │                      │ └──[up + small move]──▶ tap → idle
 *      │                      │
 *      │                      └─[2nd down]──▶ pinch (2 pointers)
 *      │                                      │
 *      └─[all up / cancel]────────────────────┘
 *
 * Pan / pinch emit continuous deltas. Tap and swipe are terminal.
 *
 * Why no long-press / double-tap in v1: those are heuristic-laden and
 * usually better delegated to the host platform. The four gestures
 * above cover 95 % of finance-chart interactions (pan to scroll
 * history, pinch to zoom, swipe to flick-scroll, tap to inspect).
 */

import { KLineChartError } from '../../errors'
import { createSignal, type Signal } from '../../foundation/reactivity/index'

// ---------------------------------------------------------------------------
// Event surface
// ---------------------------------------------------------------------------

export interface PointerEventLike {
  /** Identifier consistent across down/move/up for the same finger/pen. */
  readonly pointerId: number
  /** Client-space x. */
  readonly x: number
  /** Client-space y. */
  readonly y: number
  /** Event timestamp in ms (event.timeStamp from browsers, perf.now() OK). */
  readonly timestamp: number
}

export type GestureEvent =
  | { type: 'tap'; x: number; y: number; timestamp: number }
  | { type: 'panStart'; x: number; y: number; timestamp: number }
  | { type: 'pan'; x: number; y: number; dx: number; dy: number; timestamp: number }
  | { type: 'panEnd'; x: number; y: number; timestamp: number }
  | {
      type: 'swipe'
      x: number
      y: number
      vx: number
      vy: number
      timestamp: number
    }
  | {
      type: 'pinchStart'
      cx: number
      cy: number
      distance: number
      timestamp: number
    }
  | {
      type: 'pinch'
      cx: number
      cy: number
      distance: number
      /** Multiplicative scale relative to the pinchStart distance. */
      scale: number
      timestamp: number
    }
  | { type: 'pinchEnd'; cx: number; cy: number; timestamp: number }

export type GestureState = 'idle' | 'tracking' | 'pan' | 'pinch'

export interface GestureRecognizerOptions {
  /**
   * Pixel radius the primary pointer must escape before tracking turns
   * into a pan. Below this, the gesture is interpreted as a tap on
   * release. Default 6 — matches the click-vs-drag heuristic UI
   * frameworks settle on.
   */
  readonly panDeadzone?: number
  /**
   * Minimum velocity (px/ms) on release to classify a movement as
   * a swipe rather than a pan-end. Default 0.5 — the median swipe
   * velocity on mid-range mobile devices.
   */
  readonly swipeMinVelocity?: number
  /**
   * Window in ms over which the swipe velocity is averaged.
   * Default 100ms. Larger smooths jitter; smaller catches flicks.
   */
  readonly swipeVelocityWindowMs?: number
}

export interface GestureRecognizer {
  readonly state: Signal<GestureState>
  readonly events: Signal<GestureEvent | null>
  onPointerDown(e: PointerEventLike): void
  onPointerMove(e: PointerEventLike): void
  onPointerUp(e: PointerEventLike): void
  /** Resets to idle without emitting. Use on tab blur, etc. */
  cancel(): void
  dispose(): void
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const DEFAULT_OPTS: Required<GestureRecognizerOptions> = {
  panDeadzone: 6,
  swipeMinVelocity: 0.5,
  swipeVelocityWindowMs: 100,
}

interface ActivePointer {
  pointerId: number
  startX: number
  startY: number
  startTs: number
  lastX: number
  lastY: number
  lastTs: number
  // small ring buffer for velocity smoothing
  history: Array<{ x: number; y: number; ts: number }>
}

export function createGestureRecognizer(opts: GestureRecognizerOptions = {}): GestureRecognizer {
  if (opts.panDeadzone !== undefined && opts.panDeadzone < 0) {
    throw new KLineChartError(
      'INVALID_PARAM',
      `createGestureRecognizer: panDeadzone must be >= 0, got ${opts.panDeadzone}`,
    )
  }
  if (opts.swipeMinVelocity !== undefined && opts.swipeMinVelocity < 0) {
    throw new KLineChartError(
      'INVALID_PARAM',
      `createGestureRecognizer: swipeMinVelocity must be >= 0, got ${opts.swipeMinVelocity}`,
    )
  }
  const cfg = { ...DEFAULT_OPTS, ...opts }

  const state = createSignal<GestureState>('idle')
  const events = createSignal<GestureEvent | null>(null)
  let disposed = false

  const active = new Map<number, ActivePointer>()
  // pinchStartDistance captured when transitioning into 'pinch'
  let pinchStartDistance = 0

  function emit(event: GestureEvent): void {
    if (disposed) return
    events.set(event)
  }

  function dist(a: ActivePointer, b: ActivePointer): number {
    const dx = a.lastX - b.lastX
    const dy = a.lastY - b.lastY
    return Math.sqrt(dx * dx + dy * dy)
  }

  function centroid(a: ActivePointer, b: ActivePointer): { cx: number; cy: number } {
    return { cx: (a.lastX + b.lastX) / 2, cy: (a.lastY + b.lastY) / 2 }
  }

  function pushHistory(p: ActivePointer, e: PointerEventLike): void {
    p.history.push({ x: e.x, y: e.y, ts: e.timestamp })
    // Trim history older than the velocity window from the latest
    const cutoff = e.timestamp - cfg.swipeVelocityWindowMs
    while (p.history.length > 0 && p.history[0]!.ts < cutoff) {
      p.history.shift()
    }
  }

  function recentVelocity(p: ActivePointer): { vx: number; vy: number } {
    if (p.history.length < 2) return { vx: 0, vy: 0 }
    const first = p.history[0]!
    const last = p.history[p.history.length - 1]!
    const dt = last.ts - first.ts
    if (dt <= 0) return { vx: 0, vy: 0 }
    return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt }
  }

  function onPointerDown(e: PointerEventLike): void {
    if (disposed) return
    const p: ActivePointer = {
      pointerId: e.pointerId,
      startX: e.x,
      startY: e.y,
      startTs: e.timestamp,
      lastX: e.x,
      lastY: e.y,
      lastTs: e.timestamp,
      history: [{ x: e.x, y: e.y, ts: e.timestamp }],
    }
    active.set(e.pointerId, p)
    if (active.size === 1) {
      state.set('tracking')
    } else if (active.size === 2) {
      const [a, b] = [...active.values()] as [ActivePointer, ActivePointer]
      const c = centroid(a, b)
      pinchStartDistance = Math.max(dist(a, b), 1e-9)
      state.set('pinch')
      emit({
        type: 'pinchStart',
        cx: c.cx,
        cy: c.cy,
        distance: pinchStartDistance,
        timestamp: e.timestamp,
      })
    }
    // Extra pointers (3+) are ignored — we don't recognise 3-finger
    // gestures in v1.
  }

  function onPointerMove(e: PointerEventLike): void {
    if (disposed) return
    const p = active.get(e.pointerId)
    if (p === undefined) return
    const dx = e.x - p.lastX
    const dy = e.y - p.lastY
    p.lastX = e.x
    p.lastY = e.y
    p.lastTs = e.timestamp
    pushHistory(p, e)

    if (state.peek() === 'pinch' && active.size >= 2) {
      const [a, b] = [...active.values()] as [ActivePointer, ActivePointer]
      const c = centroid(a, b)
      const d = dist(a, b)
      emit({
        type: 'pinch',
        cx: c.cx,
        cy: c.cy,
        distance: d,
        scale: d / pinchStartDistance,
        timestamp: e.timestamp,
      })
      return
    }

    // Single-pointer path: maybe promote tracking → pan
    if (state.peek() === 'tracking') {
      const ddx = e.x - p.startX
      const ddy = e.y - p.startY
      if (Math.sqrt(ddx * ddx + ddy * ddy) > cfg.panDeadzone) {
        state.set('pan')
        emit({ type: 'panStart', x: e.x, y: e.y, timestamp: e.timestamp })
        // Also emit the first pan event right away. dx/dy carry
        // the full delta from the down position so the consumer
        // doesn't have to wait for a second move to react.
        emit({
          type: 'pan',
          x: e.x,
          y: e.y,
          dx: ddx,
          dy: ddy,
          timestamp: e.timestamp,
        })
      }
      return
    }
    if (state.peek() === 'pan') {
      emit({ type: 'pan', x: e.x, y: e.y, dx, dy, timestamp: e.timestamp })
    }
  }

  function onPointerUp(e: PointerEventLike): void {
    if (disposed) return
    const p = active.get(e.pointerId)
    if (p === undefined) return

    if (state.peek() === 'pinch') {
      // Decommit pinch; if exactly one pointer remains, drop back into
      // 'tracking' on it (the remaining finger can still pan).
      active.delete(e.pointerId)
      const remaining = active.values().next().value as ActivePointer | undefined
      const c = remaining ? { cx: remaining.lastX, cy: remaining.lastY } : { cx: e.x, cy: e.y }
      emit({ type: 'pinchEnd', cx: c.cx, cy: c.cy, timestamp: e.timestamp })
      if (active.size === 1 && remaining !== undefined) {
        // Re-baseline the remaining pointer so panDeadzone applies
        // afresh and we don't immediately fall into a pan-tracking
        // weirdness using the original press position.
        remaining.startX = remaining.lastX
        remaining.startY = remaining.lastY
        remaining.startTs = e.timestamp
        remaining.history = [{ x: remaining.lastX, y: remaining.lastY, ts: e.timestamp }]
        state.set('tracking')
      } else {
        state.set('idle')
      }
      return
    }

    // Single-pointer end paths: tap, swipe, panEnd, or just clean up.
    active.delete(e.pointerId)
    const ddx = p.lastX - p.startX
    const ddy = p.lastY - p.startY
    const distMoved = Math.sqrt(ddx * ddx + ddy * ddy)

    if (state.peek() === 'pan') {
      const { vx, vy } = recentVelocity(p)
      const speed = Math.sqrt(vx * vx + vy * vy)
      if (speed >= cfg.swipeMinVelocity) {
        emit({
          type: 'swipe',
          x: e.x,
          y: e.y,
          vx,
          vy,
          timestamp: e.timestamp,
        })
      } else {
        emit({ type: 'panEnd', x: e.x, y: e.y, timestamp: e.timestamp })
      }
    } else if (state.peek() === 'tracking') {
      if (distMoved <= cfg.panDeadzone) {
        emit({ type: 'tap', x: e.x, y: e.y, timestamp: e.timestamp })
      }
      // else: aborted gesture, no emit (movement was below deadzone
      // forever; nothing meaningful happened)
    }

    state.set(active.size === 0 ? 'idle' : 'tracking')
  }

  function cancel(): void {
    if (disposed) return
    active.clear()
    state.set('idle')
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    active.clear()
  }

  return { state, events, onPointerDown, onPointerMove, onPointerUp, cancel, dispose }
}
