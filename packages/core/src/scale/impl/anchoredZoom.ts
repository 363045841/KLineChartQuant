/**
 * Anchored zoom — ROADMAP §1.3.
 *
 * Why this exists in its own file: the "data point under the mouse stays under
 * the mouse" guarantee is the single most-felt detail of chart UX. Getting it
 * mathematically right (so the screen-pixel offset survives sequential zooms
 * within sub-pixel error) is the only path to a feel that matches TradingView.
 *
 * Forward equation, before zoom:
 *
 *     mouseX = (i_anchor - firstVisibleIndex) * barWidth + leftPadding
 *
 * Solve for `i_anchor` first (this is the bar index the user is pointing at):
 *
 *     i_anchor = (mouseX - leftPadding) / barWidth + firstVisibleIndex
 *
 * Then pick the new bar width and solve the same equation for the new first
 * visible index so that `mouseX` still maps to `i_anchor`:
 *
 *     barWidth'         = clamp(barWidth * zoomFactor, minBarWidth, maxBarWidth)
 *     firstVisibleIndex' = i_anchor - (mouseX - leftPadding) / barWidth'
 *
 * Two non-obvious cases worth flagging:
 *
 *  1. **zoomFactor === 1** is a true no-op; we short-circuit so floating-point
 *     round-trips don't sneak a sub-ULP drift into the state on every mouse-move.
 *
 *  2. **barWidth' got clamped** (user keeps wheeling at the min/max). Once the
 *     clamp engages we re-derive `firstVisibleIndex` from the clamped width.
 *     The anchor is preserved at the clamped width, which means the visible
 *     anchor point will *drift in screen X by the same amount the wheel tried
 *     to push the bar width past the clamp*. This is the expected behavior —
 *     it's how the user feels "the chart can't zoom any further" rather than
 *     watching the wheel become a silent dead-zone.
 */

import type { AnchoredZoomOptions, AnchoredZoomResult } from '../types.js'

const DEFAULT_MIN_BAR_WIDTH = 0.5
const DEFAULT_MAX_BAR_WIDTH = 200

/**
 * @internal — building block used by `createTimeScale / interaction handlers`. Reachable today
 *   via the top-level `@klinechart-quant/core` barrel but **NOT
 *   part of the supported public API**. typedoc / api-extractor
 *   hide it from generated docs. Prefer the controller factory
 *   for stable user code. Closes API audit BLOCKER-002.
 */
export function computeAnchoredZoom(opts: AnchoredZoomOptions): AnchoredZoomResult {
  const {
    mouseX,
    leftPadding,
    firstVisibleIndex,
    barWidth,
    zoomFactor,
    minBarWidth = DEFAULT_MIN_BAR_WIDTH,
    maxBarWidth = DEFAULT_MAX_BAR_WIDTH,
  } = opts

  // No-op short-circuit — avoid round-trip rounding when not zooming.
  if (zoomFactor === 1) {
    return { firstVisibleIndex, barWidth }
  }

  // Defensive: a non-positive or non-finite current barWidth would blow up the
  // inverse formula. The TimeScale itself never lets barWidth reach 0, but we
  // belt-and-brace it here so the function is total.
  if (!Number.isFinite(barWidth) || barWidth <= 0) {
    return { firstVisibleIndex, barWidth }
  }

  const dx = mouseX - leftPadding
  const iAnchor = dx / barWidth + firstVisibleIndex

  const rawNewBarWidth = barWidth * zoomFactor
  const newBarWidth = Math.min(Math.max(rawNewBarWidth, minBarWidth), maxBarWidth)

  const newFirstVisibleIndex = iAnchor - dx / newBarWidth

  return {
    firstVisibleIndex: newFirstVisibleIndex,
    barWidth: newBarWidth,
  }
}
