/**
 * Crosshair sync — broadcasts crosshair position across multiple
 * chart panes so a hover in one pane lights up the same time index
 * in every other pane.
 *
 * Why this is the controller, not just a callback:
 *
 *   - Multi-pane layouts (price + volume + 1+ indicator panes) are
 *     standard for finance charts. TradingView's multi-pane crosshair
 *     is one of its iconic UX features.
 *   - Each pane has its own scale/transform. The universal coordinate
 *     they share is the **time index** — the integer-valued position
 *     within the bar array. Sync on index, not pixel; the rendering
 *     pane converts back to its own x coordinate.
 *   - Loop prevention: a pane that consumed a sync event must not
 *     re-emit it. We track the source identifier so the pane that
 *     drove the update doesn't recurse.
 *
 * Pure data, signal-based, framework-agnostic — same shape as the
 * rest of `@klinechart-quant/core`.
 *
 *   const sync = createCrosshairSync()
 *   sync.register('price')
 *   sync.register('volume')
 *   sync.register('rsi')
 *
 *   priceContainer.addEventListener('pointermove', e => {
 *     const idx = timeScale.xToBarIndex(e.offsetX)
 *     sync.move('price', idx)
 *   })
 *
 *   sync.position.subscribe(() => {
 *     const p = sync.position.peek()
 *     if (p === null) hideCrosshair()
 *     else if (p.source !== 'volume') drawCrosshairInVolume(p.index)
 *   })
 */

import { KLineChartError } from '../../errors'
import { createSignal, type Signal } from '../../foundation/reactivity/index'

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

/**
 * Current crosshair position broadcast across registered panes.
 * `null` means no pane has the crosshair active (host left every chart
 * or `clear()` was called).
 */
export interface CrosshairPosition {
  /** Integer index into the canonical bar array. */
  readonly index: number
  /**
   * Pane id of the pane that produced this update. Consumers MUST
   * compare to skip handling their own emissions (loop prevention).
   */
  readonly source: string
}

export interface CrosshairSync {
  /**
   * Current position. `null` when no crosshair is active.
   *
   * NOTE: this is a `Signal<...>` — reading `position()` inside an
   * `effect` tracks the subscription; reading `position.peek()` does
   * not. Manual `subscribe` returns an unsubscribe function.
   */
  readonly position: Signal<CrosshairPosition | null>
  /**
   * Number of currently registered panes. Helpful for the
   * "single-pane no-op" branch in adapters.
   */
  readonly paneCount: Signal<number>

  /**
   * Register a pane that participates in the sync. Idempotent —
   * re-registering the same id is a no-op.
   */
  register(paneId: string): void
  /**
   * Unregister a pane. If the unregistered pane is the source of the
   * current position, the position is cleared (the producer is gone).
   */
  unregister(paneId: string): void
  /**
   * Producer-side update — pane `paneId` is reporting that its
   * crosshair is on bar `index`. Subscribers receive the new
   * position; `paneId` is recorded as `source` for loop prevention.
   *
   * Calling `move` from a pane that has not been registered throws
   * `KLineChartError('NOT_REGISTERED')` — the wiring contract is
   * easy to mess up and silent ignores would mask bugs.
   */
  move(paneId: string, index: number): void
  /** Clears the position. All panes see `position = null`. */
  clear(): void
  /** Reset to empty registry + null position. */
  reset(): void
  dispose(): void
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createCrosshairSync(): CrosshairSync {
  const position = createSignal<CrosshairPosition | null>(null)
  const paneCount = createSignal<number>(0)
  const panes = new Set<string>()
  let disposed = false

  function publishPaneCount(): void {
    paneCount.set(panes.size)
  }

  function register(paneId: string): void {
    if (disposed) return
    if (paneId === '' || typeof paneId !== 'string') {
      throw new KLineChartError(
        'INVALID_PARAM',
        `CrosshairSync.register: paneId must be a non-empty string`,
      )
    }
    if (panes.has(paneId)) return
    panes.add(paneId)
    publishPaneCount()
  }

  function unregister(paneId: string): void {
    if (disposed) return
    if (!panes.has(paneId)) return
    panes.delete(paneId)
    publishPaneCount()
    const cur = position.peek()
    if (cur !== null && cur.source === paneId) {
      position.set(null)
    }
  }

  function move(paneId: string, index: number): void {
    if (disposed) return
    if (!panes.has(paneId)) {
      throw new KLineChartError(
        'NOT_REGISTERED',
        `CrosshairSync.move: pane ${JSON.stringify(paneId)} is not registered — call register(${JSON.stringify(paneId)}) before move()`,
      )
    }
    if (!Number.isFinite(index)) {
      throw new KLineChartError(
        'INVALID_PARAM',
        `CrosshairSync.move: index must be finite, got ${index}`,
      )
    }
    // Normalise to integer. Sub-bar precision lives in the per-pane
    // pixel layer, not in the shared index broadcast.
    const idx = Math.round(index)
    const cur = position.peek()
    // Coalesce identical updates so subscribers don't fire on no-ops.
    if (cur !== null && cur.index === idx && cur.source === paneId) return
    position.set({ index: idx, source: paneId })
  }

  function clear(): void {
    if (disposed) return
    if (position.peek() === null) return
    position.set(null)
  }

  function reset(): void {
    if (disposed) return
    panes.clear()
    publishPaneCount()
    if (position.peek() !== null) position.set(null)
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    panes.clear()
    // No notify on dispose — subscribers should listen for their own
    // host lifecycle. Setting paneCount/position now would notify
    // dead subscribers in some host frameworks.
  }

  return { position, paneCount, register, unregister, move, clear, reset, dispose }
}
