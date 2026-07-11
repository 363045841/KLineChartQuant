/**
 * Bar Replay — public types.
 *
 * The replay subsystem models a playhead that scrubs through a finite bar
 * series. Three pacing strategies are supported:
 *
 *   - `bar`       step-by-bar; `tick()` is a no-op, callers drive position
 *                 via `stepForward` / `stepBackward` (keyboard-driven).
 *   - `wallclock` real-time playback; `tick(deltaMs)` advances by
 *                 `(deltaMs / msPerBar) * speed` bars. `speed` is a
 *                 multiplier (1 = realtime, 10 = 10x).
 *   - `tick`      synthetic tick replay; `tick(deltaMs)` advances by
 *                 `(deltaMs / 100) * speed` bars (100ms per nominal step).
 *
 * Why this matters: TradingView's Bar Replay is wall-clock only and hides its
 * state. Ours is observable via the `state` signal — any backtest engine,
 * recording session, or sibling controller can subscribe and react to
 * playhead changes deterministically.
 */

import type { Signal } from '../../foundation/reactivity/signal'

export type ReplayMode = 'paused' | 'playing'
export type ReplayPacing = 'bar' | 'wallclock' | 'tick'

export interface ReplayState {
  /** Position in the full data series; fractional values are allowed and
   *  represent sub-bar progress for wall-clock / tick pacing. Callers that
   *  need an integer bar index should `Math.floor(position)`. */
  position: number
  /** Inclusive lower bound of the playhead (clamp floor). */
  start: number
  /** Inclusive upper bound of the playhead (clamp ceiling). Typically
   *  `totalBars - 1`. */
  end: number
  mode: ReplayMode
  pacing: ReplayPacing
  /** Pacing-dependent rate:
   *  - `wallclock`: multiplier (1.0 = realtime).
   *  - `bar`:       reserved; ignored by `tick()`.
   *  - `tick`:      multiplier (1.0 = 1 bar per 100ms). */
  speed: number
}

export interface ReplayControllerInit {
  start?: number
  end?: number
  pacing?: ReplayPacing
  speed?: number
  /** Bar interval in milliseconds. Used by wall-clock pacing to compute
   *  how many bars one wall-second represents. Defaults to 60_000 (1m). */
  barIntervalMs?: number
}

export interface ReplayController {
  /** Reactive view of the entire replay state. Subscribers fire after any
   *  mutation that changes the state object (Object.is equality). */
  readonly state: Signal<ReplayState>

  /** Set the inclusive `[start, end]` range. The current position is
   *  re-clamped into the new range. Throws if `end < start`. */
  setRange(start: number, end: number): void

  /** Seek the playhead to an absolute position; clamped to `[start, end]`. */
  seekTo(position: number): void
  /** Seek by a relative delta; clamped to `[start, end]`. */
  seekBy(delta: number): void
  /** Advance exactly one bar (`position += 1`), clamped to `end`. If the
   *  step lands on `end`, mode transitions to `paused`. */
  stepForward(): void
  /** Retreat exactly one bar (`position -= 1`), clamped to `start`. */
  stepBackward(): void

  /** Begin playback from the current position using the configured
   *  pacing/speed. If already at `end`, this is a no-op. */
  play(): void
  pause(): void
  /** Toggle between `playing` and `paused`. */
  toggle(): void

  setPacing(p: ReplayPacing): void
  /** Set the speed multiplier. Throws on `speed <= 0` (reverse play not
   *  supported in v1 — see Open Question in the controller header). */
  setSpeed(s: number): void

  /** Frame-loop hook. The chart's render loop calls this with the elapsed
   *  wall-clock time since the last frame; the controller decides whether
   *  to advance `position` based on `mode`, `pacing`, and `speed`.
   *
   *  Returns `true` if `position` (and therefore `state`) changed, so the
   *  caller can request a re-render. Returns `false` for no-op frames
   *  (paused, bar-pacing, or sub-bar accumulation that didn't cross a
   *  whole-bar boundary — though in this v1 we keep `tick()` stateless and
   *  always commit the fractional advance, so any non-zero advance returns
   *  `true`). */
  tick(deltaMs: number): boolean

  /** Tear down. After `dispose()`, all mutators become silent no-ops and
   *  the `state` signal stops emitting. */
  dispose(): void
}

/** Factory shape — matches the exported function. Re-stated here so callers
 *  importing only the types file can type-check controller construction. */
export type CreateReplayController = (init?: ReplayControllerInit) => ReplayController
