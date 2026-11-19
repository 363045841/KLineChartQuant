import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DepthConnector } from '../depth/impl/depthConnector'
import type { DepthDelta, DepthSnapshot } from '../depth/types'
import { createFakeDepthSource, createFakeHeatmapController } from './helpers/depthTestKit'

describe('DepthConnector', () => {
  let source: ReturnType<typeof createFakeDepthSource>
  let connector: DepthConnector

  beforeEach(() => {
    source = createFakeDepthSource()
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
      const ctrl = createFakeHeatmapController()
      connector.addController(ctrl)
      connector.start()

      const d1: DepthDelta = { side: 'bid', price: 100, size: 5, timestamp: 1000 }
      const d2: DepthDelta = { side: 'ask', price: 101, size: 3, timestamp: 1000 }
      source.triggerDelta([d1, d2])

      expect(ctrl.calls.ingest).toEqual([d1, d2])
      connector.destroy()
    })

    it('forwards deltas to all controllers', () => {
      const ctrl1 = createFakeHeatmapController()
      const ctrl2 = createFakeHeatmapController()
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
      const ctrl1 = createFakeHeatmapController()
      const ctrl2 = createFakeHeatmapController()
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
      const ctrl = createFakeHeatmapController()
      connector.addController(ctrl)
      connector.start()

      const snap: DepthSnapshot = { bids: [[100, 5]], asks: [[101, 3]], timestamp: 5000 }
      source.triggerSnapshot(snap)

      expect(ctrl.calls.resetBook).toEqual([snap])
      connector.destroy()
    })

    it('forwards snapshot to all controllers', () => {
      const ctrl1 = createFakeHeatmapController()
      const ctrl2 = createFakeHeatmapController()
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
    it('reports the original source failure at the subscription boundary', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      connector.start()
      const error = new Error('test error')
      source.triggerError(error)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DepthConnector] test test-symbol:'),
        error,
      )
      consoleSpy.mockRestore()
      connector.destroy()
    })

    it('drops failed subscriptions and can start again after a connection failure', () => {
      const error = new Error('Connection failed')
      const controller = createFakeHeatmapController()
      const delta: DepthDelta = { side: 'ask', timestamp: 1, price: 100, size: 1 }
      connector.addController(controller)
      vi.spyOn(source, 'connect').mockImplementationOnce(() => { throw error })
      expect(() => connector.start()).toThrow(error)
      source.triggerDelta([delta])
      expect(controller.calls.ingest).toEqual([])
      connector.start()
      source.triggerDelta([delta])
      expect(controller.calls.ingest).toEqual([delta])
      connector.destroy()
    })
  })

  describe('destroy', () => {
    it('destroy() stops connector and disposes all controllers and source', () => {
      const ctrl1 = createFakeHeatmapController()
      const ctrl2 = createFakeHeatmapController()
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
      const ctrl = createFakeHeatmapController()
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
      connector.addController(createFakeHeatmapController())
      expect(connector.getControllerCount()).toBe(1)
      connector.addController(createFakeHeatmapController())
      expect(connector.getControllerCount()).toBe(2)
      connector.destroy()
      expect(connector.getControllerCount()).toBe(0)
    })
  })
})
