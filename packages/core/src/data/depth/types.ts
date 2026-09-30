/**
 * Depth/L2 data source interfaces.
 *
 * These types are data-fetcher-level abstractions — independent of any
 * specific exchange or rendering component. The connector layer
 * (depthConnector.ts) maps these into e.g. OrderBookHeatmap's types.
 */

// ---------------------------------------------------------------------------
// Delta — one exchange-pushed depth update
// ---------------------------------------------------------------------------

/**
 * A single price-level change in the L2 order book.
 * `size === 0` means the price level was removed.
 */
export interface DepthDelta {
  side: 'bid' | 'ask'
  price: number
  size: number
  /** Exchange wall-clock ms — used as the data source's clock */
  timestamp: number
}

// ---------------------------------------------------------------------------
// Snapshot — full book at one instant
// ---------------------------------------------------------------------------

/**
 * Immutable point-in-time view of the order book.
 * Bids sorted descending (best first), asks ascending (best first).
 */
export interface DepthSnapshot {
  readonly bids: ReadonlyArray<readonly [number, number]>
  readonly asks: ReadonlyArray<readonly [number, number]>
  readonly timestamp: number
}

// ---------------------------------------------------------------------------
// Source — abstraction over any real-time depth provider
// ---------------------------------------------------------------------------

export type DepthSourceStatus = 'connecting' | 'connected' | 'disconnected'

/**
 * Real-time depth data source (SSE, WS, polling — whatever).
 * Every exchange adapter implements this interface so the connector
 * layer is exchange-agnostic.
 */
export interface DepthSource {
  readonly exchange: string
  readonly symbol: string

  /** Register a delta callback. Returns unsubscribe. */
  onDelta(cb: (deltas: ReadonlyArray<DepthDelta>) => void): () => void
  /** Register a snapshot callback (full book replace). Returns unsubscribe. */
  onSnapshot(cb: (snapshot: DepthSnapshot) => void): () => void
  /** Register a status callback. Returns unsubscribe. */
  onStatus(cb: (status: DepthSourceStatus) => void): () => void
  /** Register an error callback. Returns unsubscribe. */
  onError(cb: (err: Error) => void): () => void

  /** Start the connection. Safe to call multiple times. */
  connect(): void
  /** Stop the connection. Safe to call multiple times. */
  disconnect(): void
  /** Tear down permanently — no reconnects. */
  destroy(): void
}
