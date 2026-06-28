import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BinanceSSESource, DEFAULT_BINANCE_SSE_URL } from '../binance'
import type { DepthDelta, DepthSnapshot, DepthSourceStatus } from '../depthTypes'

interface FakeEventSource {
  onopen: (() => void) | null
  onerror: ((e: unknown) => void) | null
  onmessage: ((event: { data: string }) => void) | null
  close: ReturnType<typeof vi.fn>
}

function createFakeES(): FakeEventSource {
  return {
    onopen: null,
    onerror: null,
    onmessage: null,
    close: vi.fn(),
  }
}

function makeSnapshotEvent(
  bids: ReadonlyArray<readonly [number, number]>,
  asks: ReadonlyArray<readonly [number, number]>,
  timestamp: number,
) {
  return {
    data: JSON.stringify({ type: 'snapshot', bids, asks, timestamp }),
  }
}

function makeDeltaEvent(entries: DepthDelta[]) {
  return {
    data: JSON.stringify({ type: 'delta', entries }),
  }
}

describe('BinanceSSESource', () => {
  let es: FakeEventSource
  let esFactory: ReturnType<typeof vi.fn>

  beforeEach(() => {
    es = createFakeES()
    esFactory = vi.fn(() => es as unknown as EventSource)
  })

  afterEach(() => {
    // Clean up any source that might still be connecting
  })

  function createSource(symbol = 'btcusdt', baseUrl = DEFAULT_BINANCE_SSE_URL) {
    return new BinanceSSESource(symbol, baseUrl, esFactory)
  }

  describe('connect / disconnect', () => {
    it('creates EventSource with the correct URL', () => {
      const src = createSource('ethusdt', 'http://example.com/sse')
      src.connect()
      expect(esFactory).toHaveBeenCalledWith('http://example.com/sse?symbol=ethusdt')
      src.destroy()
    })

    it('calls onopen → emits connected status', () => {
      const src = createSource()
      const statuses: DepthSourceStatus[] = []
      src.onStatus((s) => statuses.push(s))
      src.connect()
      expect(statuses).toEqual(['connecting'])
      es.onopen!()
      expect(statuses).toEqual(['connecting', 'connected'])
      src.destroy()
    })

    it('calls onerror → emits disconnected status', () => {
      const src = createSource()
      const statuses: DepthSourceStatus[] = []
      src.onStatus((s) => statuses.push(s))
      src.connect()
      es.onopen!()
      statuses.length = 0
      es.onerror!(null)
      expect(statuses).toEqual(['disconnected'])
      src.destroy()
    })

    it('disconnect() closes EventSource and emits disconnected', () => {
      const src = createSource()
      const statuses: DepthSourceStatus[] = []
      src.onStatus((s) => statuses.push(s))
      src.connect()
      es.onopen!()
      statuses.length = 0
      src.disconnect()
      expect(es.close).toHaveBeenCalledOnce()
      expect(statuses).toEqual(['disconnected'])
      src.destroy()
    })

    it('disconnect() when already disconnected is a no-op', () => {
      const src = createSource()
      src.disconnect()
      expect(es.close).not.toHaveBeenCalled()
      src.destroy()
    })

    it('connect() closes previous EventSource before creating a new one', () => {
      const src = createSource()
      src.connect()
      const es1 = es
      const es2 = createFakeES()
      esFactory.mockReturnValue(es2 as unknown as EventSource)
      src.connect()
      expect(es1.close).toHaveBeenCalledOnce()
      expect(esFactory).toHaveBeenCalledTimes(2)
      src.destroy()
    })
  })

  describe('snapshot messages', () => {
    it('calls registered snapshot callbacks on snapshot event', () => {
      const src = createSource()
      const snapshots: DepthSnapshot[] = []
      src.onSnapshot((s) => snapshots.push(s))
      src.connect()
      es.onopen!()

      es.onmessage!(makeSnapshotEvent([[100, 5]], [[101, 3]], 1000))
      expect(snapshots).toHaveLength(1)
      expect(snapshots[0].bids).toEqual([[100, 5]])
      expect(snapshots[0].asks).toEqual([[101, 3]])
      expect(snapshots[0].timestamp).toBe(1000)
      src.destroy()
    })

    it('ignores snapshot when bids/asks/timestamp are missing', () => {
      const src = createSource()
      const snapshots: DepthSnapshot[] = []
      src.onSnapshot((s) => snapshots.push(s))
      src.connect()
      es.onopen!()

      // type=snapshot but missing bids → silently ignored, no error thrown
      es.onmessage!({ data: JSON.stringify({ type: 'snapshot', asks: [], timestamp: 1 }) })
      expect(snapshots).toHaveLength(0)

      // type=snapshot but missing timestamp
      es.onmessage!({ data: JSON.stringify({ type: 'snapshot', bids: [], asks: [] }) })
      expect(snapshots).toHaveLength(0)
      src.destroy()
    })
  })

  describe('delta messages', () => {
    it('calls registered delta callbacks on delta event', () => {
      const src = createSource()
      const deltas: ReadonlyArray<DepthDelta>[] = []
      src.onDelta((d) => deltas.push(d))
      src.connect()
      es.onopen!()

      const entries: DepthDelta[] = [
        { side: 'bid', price: 100, size: 5, timestamp: 2000 },
        { side: 'ask', price: 101, size: 3, timestamp: 2000 },
      ]
      es.onmessage!(makeDeltaEvent(entries))
      expect(deltas).toHaveLength(1)
      expect(deltas[0]).toEqual(entries)
      src.destroy()
    })

    it('ignores delta when entries is missing', () => {
      const src = createSource()
      const deltas: ReadonlyArray<DepthDelta>[] = []
      src.onDelta((d) => deltas.push(d))
      src.connect()
      es.onopen!()

      es.onmessage!({ data: JSON.stringify({ type: 'delta' }) })
      expect(deltas).toHaveLength(0)
      src.destroy()
    })
  })

  describe('keepalive handling', () => {
    it('ignores empty messages', () => {
      const src = createSource()
      const deltas: ReadonlyArray<DepthDelta>[] = []
      const snapshots: DepthSnapshot[] = []
      src.onDelta((d) => deltas.push(d))
      src.onSnapshot((s) => snapshots.push(s))
      src.connect()
      es.onopen!()

      es.onmessage!({ data: '' })
      es.onmessage!({ data: ':' })
      es.onmessage!({ data: ': heartbeat' })
      expect(deltas).toHaveLength(0)
      expect(snapshots).toHaveLength(0)
      src.destroy()
    })

    it('ignores SSE comments starting with colon', () => {
      const src = createSource()
      const deltas: ReadonlyArray<DepthDelta>[] = []
      src.onDelta((d) => deltas.push(d))
      src.connect()
      es.onopen!()

      es.onmessage!({ data: ':ok' })
      expect(deltas).toHaveLength(0)
      src.destroy()
    })
  })

  describe('error handling', () => {
    it('fires error callbacks on JSON parse error', () => {
      const src = createSource()
      const errors: Error[] = []
      src.onError((e) => errors.push(e))
      src.connect()
      es.onopen!()

      es.onmessage!({ data: 'not json' })
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('BinanceSSE parse error')
      src.destroy()
    })
  })

  describe('destroy', () => {
    it('destroys closes EventSource and clears callbacks', () => {
      const src = createSource()
      const deltas: ReadonlyArray<DepthDelta>[] = []
      src.onDelta((d) => deltas.push(d))
      src.connect()
      es.onopen!()
      src.destroy()

      // After destroy, messages are ignored
      es.onmessage!(makeDeltaEvent([{ side: 'bid', price: 100, size: 1, timestamp: 1 }]))
      expect(deltas).toHaveLength(0)
    })

    it('connect() after destroy() is a no-op', () => {
      const src = createSource()
      src.destroy()
      src.connect()
      expect(esFactory).not.toHaveBeenCalled()
    })
  })

  describe('multiple subscribers', () => {
    it('notifies all delta subscribers', () => {
      const src = createSource()
      const a: ReadonlyArray<DepthDelta>[] = []
      const b: ReadonlyArray<DepthDelta>[] = []
      src.onDelta((d) => a.push(d))
      src.onDelta((d) => b.push(d))
      src.connect()
      es.onopen!()

      es.onmessage!(makeDeltaEvent([{ side: 'bid', price: 100, size: 1, timestamp: 1 }]))
      expect(a).toHaveLength(1)
      expect(b).toHaveLength(1)
      src.destroy()
    })

    it('notifies all snapshot subscribers', () => {
      const src = createSource()
      const a: DepthSnapshot[] = []
      const b: DepthSnapshot[] = []
      src.onSnapshot((s) => a.push(s))
      src.onSnapshot((s) => b.push(s))
      src.connect()
      es.onopen!()

      es.onmessage!(makeSnapshotEvent([[100, 5]], [[101, 3]], 1))
      expect(a).toHaveLength(1)
      expect(b).toHaveLength(1)
      src.destroy()
    })

    it('unsubscribe removes a callback', () => {
      const src = createSource()
      const calls: number[] = []
      const unsub = src.onDelta(() => calls.push(1))
      src.onDelta(() => calls.push(2))
      src.connect()
      es.onopen!()
      es.onmessage!(makeDeltaEvent([{ side: 'bid', price: 100, size: 1, timestamp: 1 }]))
      expect(calls).toEqual([1, 2])
      unsub()
      es.onmessage!(makeDeltaEvent([{ side: 'bid', price: 100, size: 1, timestamp: 2 }]))
      expect(calls).toEqual([1, 2, 2])
      src.destroy()
    })
  })
})
