/**
 * Streaming L2 order-book accumulator.
 *
 * Maintains two `Map<tickIndex, size>` (one per side). Prices are quantized
 * to integer tick indices on the way in and dequantized on the way out, so
 * consumers never need to know `tickSize`. A BTree is overkill here — the
 * snapshot path sorts once per snapshot, which the controller calls at most
 * every ~100ms, while applyDelta runs per-tick. Maps + lazy sort is the
 * pragmatic choice the roadmap recommends.
 *
 * `maxLevels`, when set, truncates the snapshot to the levels closest to the
 * best bid/ask. We do not drop levels from the underlying map — a quote that
 * was outside the window may move back in via a subsequent delta. Truncation
 * is purely a snapshot-time concern.
 */

import { KLineChartError } from '../../errors'

import type { BookSnapshot, OrderBookDelta, OrderBookState, OrderBookStateOptions } from './types'

const EMPTY: ReadonlyArray<readonly [number, number]> = []

export function createOrderBookState(opts: OrderBookStateOptions): OrderBookState {
  if (!(opts.tickSize > 0) || !Number.isFinite(opts.tickSize)) {
    throw new KLineChartError(
      'HEATMAP_CONFIG_INVALID',
      'createOrderBookState: tickSize must be a positive finite number',
    )
  }
  const tickSize = opts.tickSize
  const maxLevels =
    opts.maxLevels === undefined ? Infinity : Math.max(0, Math.floor(opts.maxLevels))

  // tickIndex (integer) → size
  const bids = new Map<number, number>()
  const asks = new Map<number, number>()
  let lastTs = 0

  function quantize(price: number): number {
    return Math.round(price / tickSize)
  }

  function dequantize(tick: number): number {
    // Multiplying back can introduce float dust (e.g. 0.1 * 3 !== 0.3). We
    // round to the nearest representable multiple of tickSize. Because
    // tickSize is fixed for the life of the book, the rounding is stable
    // across snapshots so consumers see consistent prices.
    const raw = tick * tickSize
    // Normalise float representation: derive precision from tickSize.
    const log10 = Math.log10(tickSize)
    const decimals = log10 < 0 ? Math.min(12, Math.ceil(-log10) + 2) : 0
    if (decimals === 0) return raw
    const factor = Math.pow(10, decimals)
    return Math.round(raw * factor) / factor
  }

  function applyDelta(delta: OrderBookDelta): void {
    if (!Number.isFinite(delta.price) || !Number.isFinite(delta.size)) return
    const tick = quantize(delta.price)
    const map = delta.side === 'bid' ? bids : asks
    if (delta.size === 0) {
      map.delete(tick)
    } else if (delta.size > 0) {
      map.set(tick, delta.size)
    } else {
      // negative sizes are nonsensical — treat as remove
      map.delete(tick)
    }
    if (delta.timestamp > lastTs) lastTs = delta.timestamp
  }

  function sortAndTruncate(
    map: Map<number, number>,
    direction: 'desc' | 'asc',
  ): ReadonlyArray<readonly [number, number]> {
    if (map.size === 0) return EMPTY
    // Pull entries → sort by tick index → dequantize.
    const ticks: number[] = [...map.keys()];
    if (direction === 'desc') ticks.sort((a, b) => b - a)
    else ticks.sort((a, b) => a - b)
    const limit = Number.isFinite(maxLevels) ? Math.min(ticks.length, maxLevels) : ticks.length
    const out: Array<readonly [number, number]> = new Array(limit)
    for (let i = 0; i < limit; i++) {
      const tick = ticks[i]
      const size = map.get(tick) as number
      out[i] = [dequantize(tick), size]
    }
    return out
  }

  function snapshot(): BookSnapshot {
    return {
      bids: sortAndTruncate(bids, 'desc'),
      asks: sortAndTruncate(asks, 'asc'),
      timestamp: lastTs,
    }
  }

  function clear(): void {
    bids.clear()
    asks.clear()
    lastTs = 0
  }

  function lastTimestamp(): number {
    return lastTs
  }

  return { applyDelta, snapshot, clear, lastTimestamp }
}
