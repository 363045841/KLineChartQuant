import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BinanceSSESource } from '../data-fetchers/binance'
import { DepthConnector } from '../data-fetchers/depthConnector'
import { createHeatmapController } from '../components/orderBookHeatmap/createHeatmapController'
import type { HeatmapController } from '../components/orderBookHeatmap/types'

// ---------------------------------------------------------------------------
// Fake EventSource — same shape as binance.test.ts
// ---------------------------------------------------------------------------
interface FakeES {
  onopen: (() => void) | null
  onerror: ((e: unknown) => void) | null
  onmessage: ((event: { data: string }) => void) | null
  close: ReturnType<typeof vi.fn>
}

function createFakeES(): FakeES {
  return {
    onopen: null,
    onerror: null,
    onmessage: null,
    close: vi.fn(),
  }
}

function snapshotMsg(
  bids: ReadonlyArray<readonly [number, number]>,
  asks: ReadonlyArray<readonly [number, number]>,
  timestamp: number,
) {
  return { data: JSON.stringify({ type: 'snapshot', bids, asks, timestamp }) }
}

function deltaMsg(entries: { side: 'bid' | 'ask'; price: number; size: number; timestamp: number }[]) {
  return { data: JSON.stringify({ type: 'delta', entries }) }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeController(
  snapshotIntervalMs = 100,
  tickSize = 0.01,
): HeatmapController {
  return createHeatmapController({
    tickSize,
    snapshotIntervalMs,
    snapshotRingCapacity: 100,
    deltaArchiveMaxSize: 10_000,
    logColorRange: { sizeMin: 1, sizeMax: 1_000_000 },
  })
}

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------
describe('depth pipeline: BinanceSSESource → DepthConnector → HeatmapController', () => {
  let es: FakeES
  let esFactory: ReturnType<typeof vi.fn>

  beforeEach(() => {
    es = createFakeES()
    esFactory = vi.fn(() => es as unknown as EventSource)
  })

  /**
   * Helper: create source, connector, controller, open the SSE connection,
   * and return everything so the test can drive events through `es`.
   */
  function wired() {
    const source = new BinanceSSESource('btcusdt', 'http://fake/sse', esFactory)
    const ctrl = makeController()
    const connector = new DepthConnector(source)
    connector.addController(ctrl)
    connector.start()
    // Simulate SSE open
    es.onopen!()
    return { source, connector, ctrl, es }
  }

  afterEach(() => {
    // Ensure no dangling connectors — each test tears down explicitly
  })

  // ── Snapshot → deltas → verify ring/archive ─────────────────────────

  it('full lifecycle: snapshot resetBook then deltas drive snapshots into the ring', () => {
    const { connector, ctrl, es } = wired()

    // --- Step 1: snapshot resets the book ---
    es.onmessage!(snapshotMsg([[100, 10], [99, 5]], [[101, 8], [102, 3]], 1000))
    let st = ctrl.state.peek()
    expect(st.latestSnapshot).not.toBeNull()
    // Book is populated from snapshot
    expect(st.latestSnapshot!.bids).toEqual([[100, 10], [99, 5]])
    expect(st.latestSnapshot!.asks).toEqual([[101, 8], [102, 3]])
    // Ring and archive are cleared
    expect(st.snapshotCount).toBe(0)
    expect(st.deltaCount).toBe(0)

    // --- Step 2: first delta anchors the clock (no snapshot emitted) ---
    es.onmessage!(deltaMsg([{ side: 'bid', price: 100, size: 15, timestamp: 1000 }]))
    st = ctrl.state.peek()
    // latestSnapshot hasn't changed (first delta doesn't emit one)
    expect(st.latestSnapshot!.bids).toEqual([[100, 10], [99, 5]])
    expect(st.snapshotCount).toBe(0)
    expect(st.deltaCount).toBe(1)
    // But the book was updated — verify via forceSnapshot
    ctrl.forceSnapshot()
    expect(ctrl.state.peek().latestSnapshot!.bids).toEqual([[100, 15], [99, 5]])

    // --- Step 3: second delta crosses snapshotIntervalMs (100ms) → one snapshot ---
    es.onmessage!(deltaMsg([{ side: 'ask', price: 101, size: 0, timestamp: 1100 }]))
    st = ctrl.state.peek()
    // Interval crossed → snapshot was emitted at 1100
    expect(st.snapshotCount).toBe(2) // previous forceSnapshot + 1
    expect(st.deltaCount).toBe(2)
    // Snapshot captured book BEFORE the delta was applied (101 is still present)
    expect(st.latestSnapshot!.asks).toEqual([[101, 8], [102, 3]])

    // --- Step 4: more deltas produce more snapshots ---
    es.onmessage!(deltaMsg([{ side: 'bid', price: 99, size: 0, timestamp: 1250 }]))
    st = ctrl.state.peek()
    // Crossed 1200 → snapshot (captures pre-delta state: bid 99 still present)
    expect(st.snapshotCount).toBe(3)
    expect(st.deltaCount).toBe(3)

    connector.destroy()
  })

  // ── Reconnect: second snapshot replaces book ────────────────────────

  it('second snapshot (simulating SSE reconnect) resets the book and clears state', () => {
    const { connector, ctrl, es } = wired()

    // Initial snapshot + deltas
    es.onmessage!(snapshotMsg([[100, 10]], [[101, 8]], 1000))
    es.onmessage!(deltaMsg([{ side: 'bid', price: 100, size: 20, timestamp: 1100 }]))
    ctrl.forceSnapshot() // capture state after first delta
    expect(ctrl.state.peek().snapshotCount).toBe(1)
    expect(ctrl.state.peek().deltaCount).toBe(1)

    // --- Reconnect: second snapshot ---
    es.onmessage!(snapshotMsg([[200, 50]], [[201, 40]], 2000))
    let st = ctrl.state.peek()
    // Book replaced and published
    expect(st.latestSnapshot!.bids).toEqual([[200, 50]])
    expect(st.latestSnapshot!.asks).toEqual([[201, 40]])
    // Everything reset
    expect(st.snapshotCount).toBe(0)
    expect(st.deltaCount).toBe(0)

    // Deltas after reconnect work normally
    es.onmessage!(deltaMsg([{ side: 'bid', price: 200, size: 60, timestamp: 2100 }]))
    st = ctrl.state.peek()
    // First delta anchors clock → no snapshot
    expect(st.snapshotCount).toBe(0)
    expect(st.deltaCount).toBe(1)
    // forceSnapshot to verify book state
    ctrl.forceSnapshot()
    expect(ctrl.state.peek().latestSnapshot!.bids).toEqual([[200, 60]])

    // Second delta crosses 100ms → snapshot
    es.onmessage!(deltaMsg([{ side: 'ask', price: 201, size: 35, timestamp: 2200 }]))
    st = ctrl.state.peek()
    expect(st.snapshotCount).toBe(2) // forceSnapshot + 1
    expect(st.deltaCount).toBe(2)
    // Snapshot at 2200 captured pre-delta book: asks still show 201→40
    expect(st.latestSnapshot!.bids).toEqual([[200, 60]])
    expect(st.latestSnapshot!.asks).toEqual([[201, 40]])

    connector.destroy()
  })

  // ── Multiple controllers ────────────────────────────────────────────

  it('one source feeds two controllers independently', () => {
    const source = new BinanceSSESource('btcusdt', 'http://fake/sse', esFactory)
    const ctrlA = makeController()
    const ctrlB = makeController()
    const connector = new DepthConnector(source)
    connector.addController(ctrlA)
    connector.addController(ctrlB)
    connector.start()
    es.onopen!()

    // Snapshot — resetBook publishes book snapshot
    es.onmessage!(snapshotMsg([[100, 5]], [[101, 3]], 500))
    expect(ctrlA.state.peek().latestSnapshot!.bids).toEqual([[100, 5]])
    expect(ctrlB.state.peek().latestSnapshot!.bids).toEqual([[100, 5]])

    // Delta — first delta anchors, no new snapshot emitted
    es.onmessage!(deltaMsg([{ side: 'bid', price: 100, size: 10, timestamp: 600 }]))
    expect(ctrlA.state.peek().deltaCount).toBe(1)
    expect(ctrlB.state.peek().deltaCount).toBe(1)
    // forceSnapshot to peek book state
    ctrlA.forceSnapshot()
    ctrlB.forceSnapshot()
    expect(ctrlA.state.peek().latestSnapshot!.bids).toEqual([[100, 10]])
    expect(ctrlB.state.peek().latestSnapshot!.bids).toEqual([[100, 10]])

    // Remove ctrlA — only ctrlB gets subsequent deltas
    connector.removeController(ctrlA)
    es.onmessage!(deltaMsg([{ side: 'ask', price: 101, size: 5, timestamp: 700 }]))
    // Delta at 700 triggers a snapshot at 700 (pre-delta state: ask 101 still 3)
    expect(ctrlB.state.peek().latestSnapshot!.asks).toEqual([[101, 3]])
    // The book did apply the delta though — verify via forceSnapshot
    ctrlB.forceSnapshot()
    expect(ctrlB.state.peek().latestSnapshot!.asks).toEqual([[101, 5]])
    // ctrlA never received this delta — forceSnapshot to verify
    ctrlA.forceSnapshot()
    expect(ctrlA.state.peek().latestSnapshot!.asks).toEqual([[101, 3]])

    connector.destroy()
  })

  // ── Quantization through the pipeline ───────────────────────────────

  it('prices are quantized through the full pipeline', () => {
    const source = new BinanceSSESource('btcusdt', 'http://fake/sse', esFactory)
    // tickSize 0.05 — coarse quantization
    const ctrl = makeController(100, 0.05)
    const connector = new DepthConnector(source)
    connector.addController(ctrl)
    connector.start()
    es.onopen!()

    // 100.07 with tick 0.05 → index 2001 → dequantized 100.05
    es.onmessage!(snapshotMsg([[100.07, 3]], [[101.03, 2]], 100))
    const st = ctrl.state.peek()
    expect(st.latestSnapshot!.bids).toEqual([[100.05, 3]])
    expect(st.latestSnapshot!.asks).toEqual([[101.05, 2]])

    connector.destroy()
  })

  // ── Destroy stops data flow ─────────────────────────────────────────

  it('destroy stops data from reaching the controller', () => {
    const { connector, ctrl, es } = wired()

    es.onmessage!(snapshotMsg([[100, 1]], [[101, 1]], 100))
    expect(ctrl.state.peek().latestSnapshot).not.toBeNull()

    connector.destroy()

    // After destroy, delta does nothing
    es.onmessage!(deltaMsg([{ side: 'bid', price: 100, size: 99, timestamp: 200 }]))
    expect(ctrl.state.peek().latestSnapshot!.bids).toEqual([[100, 1]])
  })

  // ── Error from source is caught ─────────────────────────────────────

  it('malformed SSE JSON fires error but does not crash the pipeline', () => {
    const { connector, ctrl, es } = wired()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Bad JSON
    es.onmessage!({ data: 'not valid json' })
    // Controller state is unaffected
    expect(ctrl.state.peek().latestSnapshot).toBeNull()
    expect(consoleSpy).toHaveBeenCalled()

    // Subsequent valid message still works
    es.onmessage!(snapshotMsg([[100, 1]], [[101, 1]], 100))
    expect(ctrl.state.peek().latestSnapshot).not.toBeNull()

    consoleSpy.mockRestore()
    connector.destroy()
  })

  // ── Snapshot with empty book ────────────────────────────────────────

  it('snapshot with empty bids/asks clears the book', () => {
    const { connector, ctrl, es } = wired()

    // Populate book
    es.onmessage!(snapshotMsg([[100, 10]], [[101, 8]], 500))
    expect(ctrl.state.peek().latestSnapshot!.bids).toHaveLength(1)

    // Empty snapshot
    es.onmessage!(snapshotMsg([], [], 600))
    const st = ctrl.state.peek()
    expect(st.latestSnapshot!.bids).toEqual([])
    expect(st.latestSnapshot!.asks).toEqual([])

    connector.destroy()
  })
})
