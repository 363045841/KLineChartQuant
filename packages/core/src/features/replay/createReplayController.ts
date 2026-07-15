import { KLineChartError } from '../../errors'
/**
 * createReplayController — framework-agnostic Bar Replay state machine.
 *
 * Owns: position, mode, pacing, speed, [start, end] range.
 * Doesn't own: the data series, the calendar, the frame loop. Those are
 * supplied by the surrounding chart adapter.
 *
 * Why we expose it via a single `state` signal (rather than five separate
 * signals): every replay mutation is a transaction over the playhead — the
 * mode flip on auto-pause, the clamp on `setRange`, etc. Emitting a single
 * snapshot keeps subscribers (React/Vue) from rendering intermediate states.
 *
 * Open design question (deferred from v1):
 *   Should "reverse play" (speed < 0) be supported in v2?
 *   The cleanest extension is to drop the `speed <= 0` guard, accept negative
 *   multipliers in `tick()` math (already symmetric), and add an
 *   `autoStartReached` clamp that mirrors `autoEndReached`. The on-disk
 *   contract (the `ReplayState` shape) does not need to change. We defer it
 *   because reverse playback is meaningless for live-data sessions and the
 *   indicator runtime currently assumes monotonic time — flipping that
 *   assumption is a larger cross-package change than this PR.
 */

import { createSignal, type Signal } from '../../foundation/reactivity/signal'

import type {
  ReplayController,
  ReplayControllerInit,
  ReplayMode,
  ReplayPacing,
  ReplayState,
} from './types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default bar interval used by wall-clock pacing when the host did not
 *  supply one via `init.barIntervalMs`. Picked to match the most common
 *  intraday chart (1-minute bars). */
const DEFAULT_BAR_INTERVAL_MS = 60_000

/** For `tick` pacing, this is the nominal wall-time spent on one bar at
 *  speed=1. 100ms means a 60-bar tick replay takes 6 seconds at 1x — fast
 *  enough to feel like "tick playback", slow enough to follow visually. */
const TICK_PACING_MS_PER_BAR = 100

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, lo: number, hi: number): number {
  if (value < lo) return lo
  if (value > hi) return hi
  return value
}

function assertValidRange(start: number, end: number): void {
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new KLineChartError(
      'REPLAY_CONFIG_INVALID',
      `Replay range must be finite numbers: got start=${String(start)}, end=${String(end)}`,
    )
  }
  if (end < start) {
    throw new KLineChartError(
      'REPLAY_CONFIG_INVALID',
      `Replay range end (${end}) must be >= start (${start})`,
    )
  }
}

function assertValidSpeed(speed: number): void {
  if (!Number.isFinite(speed) || speed <= 0) {
    // Reverse playback (negative speed) is deliberately rejected in v1.
    // See the header comment for the extension path.
    throw new KLineChartError(
      'REPLAY_CONFIG_INVALID',
      `Replay speed must be a positive finite number; got ${String(speed)}`,
    )
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createReplayController(init?: ReplayControllerInit): ReplayController {
  // -------------------------------------------------------------------
  // Initial state — validate eagerly so misconfiguration surfaces at
  // construction rather than on first tick.
  // -------------------------------------------------------------------
  const start = init?.start ?? 0
  const end = init?.end ?? 0
  assertValidRange(start, end)

  const pacing: ReplayPacing = init?.pacing ?? 'bar'
  const speed = init?.speed ?? 1
  assertValidSpeed(speed)

  const barIntervalMs = init?.barIntervalMs ?? DEFAULT_BAR_INTERVAL_MS
  if (!Number.isFinite(barIntervalMs) || barIntervalMs <= 0) {
    throw new KLineChartError(
      'REPLAY_CONFIG_INVALID',
      `barIntervalMs must be a positive finite number; got ${String(barIntervalMs)}`,
    )
  }

  const state: Signal<ReplayState> = createSignal<ReplayState>({
    position: start,
    start,
    end,
    mode: 'paused',
    pacing,
    speed,
  })

  // -------------------------------------------------------------------
  // Internal commit helper. All mutations funnel through here so the
  // immutability invariant and auto-pause check live in one place.
  // -------------------------------------------------------------------
  function commit(patch: Partial<ReplayState>): void {
    const prev = state.peek()
    const next: ReplayState = { ...prev, ...patch }

    // Re-clamp position whenever it or the range changed.
    if (patch.position !== undefined || patch.start !== undefined || patch.end !== undefined) {
      next.position = clamp(next.position, next.start, next.end)
    }

    // Auto-pause when the playhead arrives at the right edge while
    // playing. This is the natural end-of-tape transition; without it,
    // the frame loop would happily tick forever against a clamped
    // value and waste battery.
    if (next.mode === 'playing' && next.position >= next.end) {
      next.position = next.end
      next.mode = 'paused'
    }

    // Object.is short-circuits identical structural snapshots so a
    // no-op commit (e.g. seekTo(currentPosition)) doesn't notify.
    if (
      prev.position === next.position &&
      prev.start === next.start &&
      prev.end === next.end &&
      prev.mode === next.mode &&
      prev.pacing === next.pacing &&
      prev.speed === next.speed
    ) {
      return
    }

    state.set(next)
  }

  // -------------------------------------------------------------------
  // Public mutators
  // -------------------------------------------------------------------
  function setRange(nextStart: number, nextEnd: number): void {
    assertValidRange(nextStart, nextEnd)
    commit({ start: nextStart, end: nextEnd })
  }

  function seekTo(position: number): void {
    if (!Number.isFinite(position)) return
    commit({ position })
  }

  function seekBy(delta: number): void {
    if (!Number.isFinite(delta)) return
    const cur = state.peek().position
    commit({ position: cur + delta })
  }

  function stepForward(): void {
    seekBy(1)
  }

  function stepBackward(): void {
    seekBy(-1)
  }

  function play(): void {
    const cur = state.peek()
    // If we're already at the end, calling play() should not flip to
    // 'playing' only to immediately auto-pause — that would be a
    // confusing observable transition for subscribers. Stay paused.
    if (cur.position >= cur.end) return
    commit({ mode: 'playing' })
  }

  function pause(): void {
    commit({ mode: 'paused' })
  }

  function toggle(): void {
    const cur = state.peek()
    if (cur.mode === 'playing') {
      pause()
    } else {
      play()
    }
  }

  function setPacing(p: ReplayPacing): void {
    commit({ pacing: p })
  }

  function setSpeed(s: number): void {
    assertValidSpeed(s)
    commit({ speed: s })
  }

  // -------------------------------------------------------------------
  // Frame-loop driver
  //
  // `tick()` is deliberately stateless w.r.t. internal clock
  // accumulation: each call applies the full advance derived from
  // `deltaMs` directly to `position`. We DO carry fractional position
  // values forward through the signal itself, so sub-bar progress is
  // visible to subscribers (useful for smooth scrubbing animations and
  // for sub-bar interpolation in the renderer).
  //
  // Rationale: a stateful internal accumulator would hide state from
  // the signal, defeating the "fully observable" property that
  // distinguishes us from TradingView. Anyone driving the controller
  // can save/restore the entire replay session by snapshotting the
  // state signal — no hidden bookkeeping.
  // -------------------------------------------------------------------
  function tick(deltaMs: number): boolean {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return false

    const cur = state.peek()
    if (cur.mode !== 'playing') return false

    let advance = 0
    switch (cur.pacing) {
      case 'bar':
        // Bar pacing is keyboard-driven: tick() never auto-advances.
        return false
      case 'wallclock':
        advance = (deltaMs / barIntervalMs) * cur.speed
        break
      case 'tick':
        advance = (deltaMs / TICK_PACING_MS_PER_BAR) * cur.speed
        break
    }

    if (advance === 0) return false

    const prevPosition = cur.position
    commit({ position: cur.position + advance })
    // commit() may have clamped or auto-paused; the only way position
    // genuinely did not change is if we were already at end and the
    // clamp swallowed the advance.
    return state.peek().position !== prevPosition
  }

  // -------------------------------------------------------------------
  // Disposal — same guard pattern as createIndicatorSelectorController.
  // -------------------------------------------------------------------
  let disposed = false

  function dispose(): void {
    if (disposed) return
    disposed = true
  }

  function guard<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
    return (...args: A): R => {
      if (disposed) return undefined as R
      return fn(...args)
    }
  }

  return {
    state,
    setRange: guard(setRange),
    seekTo: guard(seekTo),
    seekBy: guard(seekBy),
    stepForward: guard(stepForward),
    stepBackward: guard(stepBackward),
    play: guard(play),
    pause: guard(pause),
    toggle: guard(toggle),
    setPacing: guard(setPacing),
    setSpeed: guard(setSpeed),
    tick: (deltaMs: number): boolean => {
      if (disposed) return false
      return tick(deltaMs)
    },
    dispose,
  }
}
