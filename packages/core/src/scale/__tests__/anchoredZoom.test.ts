import { describe, it, expect } from 'vitest'

import { computeAnchoredZoom } from '../anchoredZoom'

/**
 * Helper: project a bar index to screen X using the same formula the scale
 * uses, so we can verify the anchor invariant after zoom.
 *
 *     x(i) = (i - firstVisibleIndex) * barWidth + leftPadding
 */
const barIndexToX = (
  i: number,
  firstVisibleIndex: number,
  barWidth: number,
  leftPadding: number,
): number => (i - firstVisibleIndex) * barWidth + leftPadding

describe('computeAnchoredZoom', () => {
  it('zoom in: the data point under the cursor stays under the cursor (< 0.5px)', () => {
    const before = { mouseX: 600, leftPadding: 60, firstVisibleIndex: 20, barWidth: 10 }
    // Bar index under cursor before zoom:
    const iAnchor =
      (before.mouseX - before.leftPadding) / before.barWidth + before.firstVisibleIndex

    const after = computeAnchoredZoom({ ...before, zoomFactor: 1.5 })

    // Where does that same data bar land on screen now?
    const xAfter = barIndexToX(iAnchor, after.firstVisibleIndex, after.barWidth, before.leftPadding)
    expect(Math.abs(xAfter - before.mouseX)).toBeLessThan(0.5)
    // ...and bar width should have grown.
    expect(after.barWidth).toBeGreaterThan(before.barWidth)
  })

  it('zoom out: anchor preservation also holds for k < 1', () => {
    const before = { mouseX: 423.7, leftPadding: 50, firstVisibleIndex: 100.5, barWidth: 12 }
    const iAnchor =
      (before.mouseX - before.leftPadding) / before.barWidth + before.firstVisibleIndex

    const after = computeAnchoredZoom({ ...before, zoomFactor: 0.5 })

    const xAfter = barIndexToX(iAnchor, after.firstVisibleIndex, after.barWidth, before.leftPadding)
    expect(Math.abs(xAfter - before.mouseX)).toBeLessThan(0.5)
    expect(after.barWidth).toBeCloseTo(6, 10)
  })

  it('zoomFactor === 1 is a true no-op (returns the input verbatim)', () => {
    const input = {
      mouseX: 200,
      leftPadding: 60,
      firstVisibleIndex: 7.5,
      barWidth: 9.3,
      zoomFactor: 1,
    }
    const out = computeAnchoredZoom(input)
    expect(out.firstVisibleIndex).toBe(input.firstVisibleIndex)
    expect(out.barWidth).toBe(input.barWidth)
  })

  it('clamps barWidth at maxBarWidth (anchor preserved at the clamped width)', () => {
    const before = { mouseX: 400, leftPadding: 60, firstVisibleIndex: 0, barWidth: 150 }
    const after = computeAnchoredZoom({
      ...before,
      zoomFactor: 5, // would push barWidth to 750, far past max 200
      maxBarWidth: 200,
    })
    expect(after.barWidth).toBe(200)

    // The anchor must still be honoured for the clamped barWidth.
    const iAnchor =
      (before.mouseX - before.leftPadding) / before.barWidth + before.firstVisibleIndex
    const xAfter = barIndexToX(iAnchor, after.firstVisibleIndex, after.barWidth, before.leftPadding)
    expect(Math.abs(xAfter - before.mouseX)).toBeLessThan(0.5)
  })

  it('clamps barWidth at minBarWidth', () => {
    const before = { mouseX: 300, leftPadding: 60, firstVisibleIndex: 5, barWidth: 1 }
    const after = computeAnchoredZoom({
      ...before,
      zoomFactor: 0.1, // would push to 0.1, below min 0.5
      minBarWidth: 0.5,
    })
    expect(after.barWidth).toBe(0.5)

    const iAnchor =
      (before.mouseX - before.leftPadding) / before.barWidth + before.firstVisibleIndex
    const xAfter = barIndexToX(iAnchor, after.firstVisibleIndex, after.barWidth, before.leftPadding)
    expect(Math.abs(xAfter - before.mouseX)).toBeLessThan(0.5)
  })

  it('still works when mouseX is left of the content area (mouseX < leftPadding)', () => {
    // Cursor is in the y-axis area — i_anchor is negative but the math is identical.
    const before = { mouseX: 20, leftPadding: 60, firstVisibleIndex: 0, barWidth: 10 }
    const iAnchor =
      (before.mouseX - before.leftPadding) / before.barWidth + before.firstVisibleIndex
    expect(iAnchor).toBeLessThan(0)

    const after = computeAnchoredZoom({ ...before, zoomFactor: 2 })
    const xAfter = barIndexToX(iAnchor, after.firstVisibleIndex, after.barWidth, before.leftPadding)
    expect(Math.abs(xAfter - before.mouseX)).toBeLessThan(0.5)
  })

  it('sequential zooms compose with sub-pixel anchor drift', () => {
    // The really telling test: zoom in then out then in again. Track the
    // anchor's screen-X error across all steps; it must never exceed 0.5px.
    let state = { firstVisibleIndex: 50, barWidth: 8 }
    const leftPadding = 60
    const mouseX = 720
    const iAnchor = (mouseX - leftPadding) / state.barWidth + state.firstVisibleIndex

    const factors = [1.3, 0.8, 1.4, 0.6, 1.2, 0.9]
    let maxErr = 0
    for (const k of factors) {
      state = computeAnchoredZoom({
        mouseX,
        leftPadding,
        firstVisibleIndex: state.firstVisibleIndex,
        barWidth: state.barWidth,
        zoomFactor: k,
      })
      const xAfter = barIndexToX(iAnchor, state.firstVisibleIndex, state.barWidth, leftPadding)
      maxErr = Math.max(maxErr, Math.abs(xAfter - mouseX))
    }
    expect(maxErr).toBeLessThan(0.5)
  })

  it('does not perturb state when barWidth is non-finite (defensive)', () => {
    const out = computeAnchoredZoom({
      mouseX: 100,
      leftPadding: 0,
      firstVisibleIndex: 0,
      barWidth: 0, // pathological
      zoomFactor: 2,
    })
    expect(out.barWidth).toBe(0)
    expect(out.firstVisibleIndex).toBe(0)
  })
})
