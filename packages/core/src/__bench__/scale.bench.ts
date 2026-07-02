/**
 * Coordinate-system math — anchored zoom + origin-shift rebaseline.
 *
 * These run inside the input-event handler at 60+ fps. Every microsecond
 * burned here is a frame the chart loses. Goal numbers:
 *   computeAnchoredZoom:       target < 100 ns/op
 *   originShift.maybeRebaseline: target < 50 ns/op
 *
 * Both functions are pure + branch-light by design. If the bench
 * regresses, somebody added work to the hot path.
 */

import { describe, bench } from 'vitest'

import { computeAnchoredZoom } from '../scale/anchoredZoom'
import { createOriginShiftPolicy } from '../scale/originShift'

describe('Anchored zoom — 100k operations', () => {
  bench('zoom-in factor 1.1, 100k calls', () => {
    let fvi = 0
    let bw = 10
    for (let i = 0; i < 100_000; i++) {
      const r = computeAnchoredZoom({
        mouseX: 500,
        leftPadding: 0,
        firstVisibleIndex: fvi,
        barWidth: bw,
        zoomFactor: 1.1,
      })
      fvi = r.firstVisibleIndex
      bw = r.barWidth
    }
  })

  bench('zoom-out factor 0.9, 100k calls', () => {
    let fvi = 0
    let bw = 10
    for (let i = 0; i < 100_000; i++) {
      const r = computeAnchoredZoom({
        mouseX: 500,
        leftPadding: 0,
        firstVisibleIndex: fvi,
        barWidth: bw,
        zoomFactor: 0.9,
      })
      fvi = r.firstVisibleIndex
      bw = r.barWidth
    }
  })

  bench('zoom clamped at minBarWidth (saturated), 100k calls', () => {
    let fvi = 0
    for (let i = 0; i < 100_000; i++) {
      const r = computeAnchoredZoom({
        mouseX: 500,
        leftPadding: 0,
        firstVisibleIndex: fvi,
        barWidth: 0.5,
        zoomFactor: 0.5,
        minBarWidth: 0.5,
      })
      fvi = r.firstVisibleIndex
    }
  })
})

describe('Origin-shift — pan simulation 100k frames', () => {
  bench('threshold 0.01 (rebase ~1% drift)', () => {
    const policy = createOriginShiftPolicy(100, 0.01)
    for (let i = 0; i < 100_000; i++) {
      policy.maybeRebaseline(100 + i * 0.001, 10)
    }
  })

  bench('threshold 0 (legacy per-frame rebase)', () => {
    const policy = createOriginShiftPolicy(100, 0)
    for (let i = 0; i < 100_000; i++) {
      policy.maybeRebaseline(100 + i * 0.001, 10)
    }
  })
})
