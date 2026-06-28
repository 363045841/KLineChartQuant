import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DepthConnector } from '../depthConnector'
import type {
  DepthDelta,
  DepthSnapshot,
  DepthSource,
  DepthSourceStatus,
} from '../depthTypes'
import type { HeatmapController, HeatmapControllerConfig } from '../../components/orderBookHeatmap'

// ---------------------------------------------------------------------------
// Fake DepthSource — controllable callbacks
// ---------------------------------------------------------------------------
function createFakeSource(): DepthSource & {
  triggerDelta: (deltas: ReadonlyArray<DepthDelta>) => void
  triggerSnapshot: (snap: DepthSnapshot) => void
  triggerError: (err: Error) => void
  triggerStatus: (s: DepthSourceStatus) => void
} {
  const deltaCbs: Array<(d: ReadonlyArray<DepthDelta>) => void> = []
  const snapshotCbs: Array<(s: DepthSnapshot) => void> = []
  const errorCbs: Array<(e: Error) => void> = []
  const statusCbs: Array<(s: DepthSourceStatus) => void> = []

  return {
    exchange: 'test',
    symbol: 'test-symbol',
    onDelta: (cb) => {
      deltaCbs.push(cb)
      return () => {
        const idx = deltaCbs.indexOf(cb)
        if (idx >= 0) deltaCbs.splice(idx, 1)
      }
    },
    onSnapshot: (cb) => {
      snapshotCbs.push(cb)
      return () => {
        const idx = snapshotCbs.indexOf(cb)
        if (idx >= 0) snapshotCbs.splice(idx, 1)
      }
    },
    onError: (cb) => {
      errorCbs.push(cb)
      return () => {
        const idx = errorCbs.indexOf(cb)
        if (idx >= 0) errorCbs.splice(idx, 1)
      }
    },
    onStatus: (cb) => {
      statusCbs.push(cb)
      return () => {
        const idx = statusCbs.indexOf(cb)
        if (idx >= 0) statusCbs.splice(idx, 1)
      }
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
    destroy: vi.fn(),
    triggerDelta: (deltas) => {
      for (const cb of deltaCbs) cb(deltas)
    },
    triggerSnapshot: (snap) => {
      for (const cb of snapshotCbs) cb(snap)
    },
    triggerError: (err) => {
      for (const cb of errorCbs) cb(err)
    },
    triggerStatus: (s) => {
      for (const cb of statusCbs) cb(s)
    },
  }
}

// ---------------------------------------------------------------------------
// Fake HeatmapController
// ---------------------------------------------------------------------------
function createFakeController(): HeatmapController & { calls: { ingest: DepthDelta[]; resetBook: DepthSnapshot[] } } {
  const calls: { ingest: DepthDelta[]; resetBook: DepthSnapshot[] } = {
    ingest: [],
    resetBook: [],
  }
  return {
    state: null as never,
    ingest: (d: DepthDelta) => calls.ingest.push(d),
    ingestDelta: () => {},
    forceSnapshot: () => {},
    replay: () => [],
    resetBook: (s: DepthSnapshot) => calls.resetBook.push(s),
    setConfig: () => {},
    dispose: vi.fn(),
    calls,
  }
}

describe('DepthConnector', () => {
  let source: ReturnType<typeof createFakeSource>
  let connector: DepthConnector

  beforeEach(() => {
    source = createFakeSource()
    connector = new DepthConnector(source)
  })

  describe('start / stop', () => {
    it('start() subscribes to source events and calls source.connect()', () => {
      connector.start()
      expect(source.connect).toHaveBeenCalledOnce()
    })

    it('start() is idempotent — second call does nothing', () => {
      connector.start()
      connector.start()
      expect(source.connect).toHaveBeenCalledOnce()
    })

    it('stop() unsubscribes and calls source.disconnect()', () => {
      connector.start()
      connector.stop()
      expect(source.disconnect).toHaveBeenCalledOnce()
    })

    it('stop() is idempotent', () => {
      connector.stop()
      connector.stop()
      expect(source.disconnect).not.toHaveBeenCalled()
    })
  })

  describe('delta forwarding', () => {
    it('forwards deltas from source to controller.ingest()', () => {
      const ctrl = createFakeController()
      connector.addController(ctrl)
      connector.start()

      const d1: DepthDelta = { side: 'bid', price: 100, size: 5, timestamp: 1000 }
      const d2: DepthDelta = { side: 'ask', price: 101, size: 3, timestamp: 1000 }
      source.triggerDelta([d1, d2])

      expect(ctrl.calls.ingest).toEqual([d1, d2])
      connector.destroy()
    })

    it('forwards deltas to all controllers', () => {
      const ctrl1 = createFakeController()
      const ctrl2 = createFakeController()
      connector.addController(ctrl1)
      connector.addController(ctrl2)
      connector.start()

      const d: DepthDelta = { side: 'bid', price: 100, size: 1, timestamp: 1 }
      source.triggerDelta([d])

      expect(ctrl1.calls.ingest).toEqual([d])
      expect(ctrl2.calls.ingest).toEqual([d])
      connector.destroy()
    })

    it('removed controller stops receiving deltas', () => {
      const ctrl1 = createFakeController()
      const ctrl2 = createFakeController()
      connector.addController(ctrl1)
      connector.addController(ctrl2)
      connector.start()

      const d1: DepthDelta = { side: 'bid', price: 100, size: 1, timestamp: 1 }
      source.triggerDelta([d1])
      expect(ctrl1.calls.ingest).toHaveLength(1)

      connector.removeController(ctrl1)
      const d2: DepthDelta = { side: 'ask', price: 101, size: 1, timestamp: 2 }
      source.triggerDelta([d2])
      expect(ctrl1.calls.ingest).toHaveLength(1)
      expect(ctrl2.calls.ingest).toHaveLength(2)
      connector.destroy()
    })
  })

  describe('snapshot forwarding', () => {
    it('forwards snapshot from source to controller.resetBook()', () => {
      const ctrl = createFakeController()
      connector.addController(ctrl)
      connector.start()

      const snap: DepthSnapshot = { bids: [[100, 5]], asks: [[101, 3]], timestamp: 5000 }
      source.triggerSnapshot(snap)

      expect(ctrl.calls.resetBook).toEqual([snap])
      connector.destroy()
    })

    it('forwards snapshot to all controllers', () => {
      const ctrl1 = createFakeController()
      const ctrl2 = createFakeController()
      connector.addController(ctrl1)
      connector.addController(ctrl2)
      connector.start()

      const snap: DepthSnapshot = { bids: [[100, 5]], asks: [], timestamp: 1 }
      source.triggerSnapshot(snap)

      expect(ctrl1.calls.resetBook).toHaveLength(1)
      expect(ctrl2.calls.resetBook).toHaveLength(1)
      connector.destroy()
    })
  })

  describe('error handling', () => {
    it('catches source errors without throwing (logs to console)', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      connector.start()
      source.triggerError(new Error('test error'))
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DepthConnector] test test-symbol:'),
        expect.stringContaining('test error'),
      )
      consoleSpy.mockRestore()
      connector.destroy()
    })
  })

  describe('destroy', () => {
    it('destroy() stops connector and disposes all controllers and source', () => {
      const ctrl1 = createFakeController()
      const ctrl2 = createFakeController()
      connector.addController(ctrl1)
      connector.addController(ctrl2)
      connector.start()

      connector.destroy()

      expect(source.disconnect).toHaveBeenCalled()
      expect(ctrl1.dispose).toHaveBeenCalledOnce()
      expect(ctrl2.dispose).toHaveBeenCalledOnce()
      expect(source.destroy).toHaveBeenCalledOnce()
      expect(connector.getControllerCount()).toBe(0)
    })
  })

  describe('addController before start', () => {
    it('controllers added before start still receive events', () => {
      const ctrl = createFakeController()
      connector.addController(ctrl)
      connector.start()

      source.triggerDelta([{ side: 'bid', price: 100, size: 1, timestamp: 1 }])
      expect(ctrl.calls.ingest).toHaveLength(1)
      connector.destroy()
    })
  })

  describe('getControllerCount', () => {
    it('reports correct controller count', () => {
      expect(connector.getControllerCount()).toBe(0)
      connector.addController(createFakeController())
      expect(connector.getControllerCount()).toBe(1)
      connector.addController(createFakeController())
      expect(connector.getControllerCount()).toBe(2)
      connector.destroy()
      expect(connector.getControllerCount()).toBe(0)
    })
  })
})
