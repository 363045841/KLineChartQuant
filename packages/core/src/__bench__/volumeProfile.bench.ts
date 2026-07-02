/**
 * Volume Profile binning — typical-price vs proportional modes at scale.
 *
 * Goal numbers per ROADMAP §3.1: bin 100k bars into 100 buckets in
 *   typical-price mode: target < 5 ms
 *   proportional mode:  target < 25 ms (5x extra work split across overlap)
 *
 * These are CPU baselines. The WGSL compute path (computeShader.wgsl.md)
 * will move these to GPU when WebGPU renderer lands; the bench then
 * becomes the regression alarm for the CPU fallback.
 */

import { describe, bench } from 'vitest'

import { binBarToBuckets } from '../components/volumeProfile/binning'

// Realistic OHLCV stream: random walk around 100, ATR ≈ 2.
function makeBars(n: number): Array<{ high: number; low: number; close: number; volume: number }> {
  const bars = new Array(n)
  let p = 100
  for (let i = 0; i < n; i++) {
    const noise = (Math.random() - 0.5) * 4
    p += noise * 0.1
    const high = p + Math.random() * 2
    const low = p - Math.random() * 2
    const close = low + Math.random() * (high - low)
    bars[i] = { high, low, close, volume: 100 + Math.random() * 900 }
  }
  return bars
}

const BIN_COUNT = 100
const BIN_MIN = 80
const BIN_SIZE = 0.5

const bars10k = makeBars(10_000)
const bars100k = makeBars(100_000)

describe('Volume Profile binning', () => {
  bench('typical-price | 10k bars × 100 buckets', () => {
    const buckets = new Float64Array(BIN_COUNT)
    for (const bar of bars10k) {
      binBarToBuckets(bar, buckets, BIN_MIN, BIN_SIZE, BIN_COUNT, 'typical-price')
    }
  })

  bench('typical-price | 100k bars × 100 buckets', () => {
    const buckets = new Float64Array(BIN_COUNT)
    for (const bar of bars100k) {
      binBarToBuckets(bar, buckets, BIN_MIN, BIN_SIZE, BIN_COUNT, 'typical-price')
    }
  })

  bench('proportional  | 10k bars × 100 buckets', () => {
    const buckets = new Float64Array(BIN_COUNT)
    for (const bar of bars10k) {
      binBarToBuckets(bar, buckets, BIN_MIN, BIN_SIZE, BIN_COUNT, 'proportional')
    }
  })

  bench('proportional  | 100k bars × 100 buckets', () => {
    const buckets = new Float64Array(BIN_COUNT)
    for (const bar of bars100k) {
      binBarToBuckets(bar, buckets, BIN_MIN, BIN_SIZE, BIN_COUNT, 'proportional')
    }
  })
})
