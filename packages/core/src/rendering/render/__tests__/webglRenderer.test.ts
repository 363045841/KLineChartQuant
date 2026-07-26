import { describe, it, expect, vi, beforeEach } from 'vitest'

import { createWebGLRenderer } from '../createWebGLRenderer'
import type { SurfaceBackend, SurfaceRegion } from '../index'

const mocks = vi.hoisted(() => ({
  mockDrawRectBuffer: vi.fn(() => true),
  mockDrawLineStrips: vi.fn(() => true),
  mockDrawFilledBand: vi.fn(() => true),
  mockSetRegion: vi.fn(),
  mockResize: vi.fn(),
  mockDestroyCandle: vi.fn(),
  mockDestroyLine: vi.fn(),
}))

vi.mock('../../../engine/renderers/webgl/candleSurface', () => {
  const mr = mocks
  return {
    CandleWebGLSurface: class {
      isAvailable = () => true
      setRegion = mr.mockSetRegion
      resize = mr.mockResize
      clear = () => {}
      drawRectBuffer = mr.mockDrawRectBuffer
      drawRects = () => true
      destroy = mr.mockDestroyCandle
    },
    LineWebGLSurface: class {
      isAvailable = () => true
      setRegion = mr.mockSetRegion
      resize = mr.mockResize
      clear = () => {}
      drawLineStrips = mr.mockDrawLineStrips
      drawFilledBand = mr.mockDrawFilledBand
      destroy = mr.mockDestroyLine
    },
  }
})

function createMockSurfaceBackend(): SurfaceBackend {
  let disposed = false
  return {
    isAvailable: () => !disposed,
    resize: vi.fn(),
    bindRegion: vi.fn((region: SurfaceRegion) => {
      if (disposed) return false
      return region.width > 0 && region.height > 0
    }),
    clearRegion: vi.fn(),
    compositeTo: vi.fn(),
    dispose: vi.fn(() => {
      disposed = true
    }),
  }
}

function createMockSharedWebGLSurface() {
  return {
    isAvailable: vi.fn(() => true),
    getGL: vi.fn(() => null),
    getCanvas: vi.fn(() => ({ width: 0, height: 0 }) as HTMLCanvasElement),
    resize: vi.fn(),
    bindRegion: vi.fn(() => true),
    clearRegion: vi.fn(),
    compositeRegionTo: vi.fn(),
    getPhysicalRegion: vi.fn(() => null),
    destroy: vi.fn(),
  }
}

function makeRenderer(): {
  renderer: ReturnType<typeof createWebGLRenderer>
  surface: SurfaceBackend
  glSurface: ReturnType<typeof createMockSharedWebGLSurface>
} {
  const surface = createMockSurfaceBackend()
  const glSurface = createMockSharedWebGLSurface()
  const renderer = createWebGLRenderer(surface, glSurface as any)
  return { renderer, surface, glSurface }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createWebGLRenderer', () => {
  describe('surface and caps accessors', () => {
    it('surface returns the SurfaceBackend passed to the factory', () => {
      const { renderer, surface } = makeRenderer()
      expect(renderer.surface).toBe(surface)
    })

    it('caps reports webgl2 with compute disabled', () => {
      const { renderer } = makeRenderer()
      expect(renderer.caps).toEqual({
        compute: false,
        storageBuffer: false,
        maxInstances: 1_000_000,
        name: 'webgl2',
      })
    })
  })

  describe('buffer lifecycle', () => {
    it('createBuffer returns an opaque handle', () => {
      const { renderer } = makeRenderer()
      const handle = renderer.createBuffer('vertex', 1024)
      expect(handle).toBeDefined()
      expect(typeof handle).toBe('object')
    })

    it('each createBuffer call returns a distinct handle', () => {
      const { renderer } = makeRenderer()
      const a = renderer.createBuffer('vertex', 64)
      const b = renderer.createBuffer('instance', 128)
      expect(a).not.toBe(b)
    })

    it('writeBuffer + destroyBuffer round-trips without error', () => {
      const { renderer } = makeRenderer()
      const handle = renderer.createBuffer('vertex', 1024)
      const data = new Float32Array([1, 2, 3, 4])
      expect(() => renderer.writeBuffer(handle, data)).not.toThrow()
      expect(() => renderer.writeBuffer(handle, data, 16)).not.toThrow()
      expect(() => renderer.destroyBuffer(handle)).not.toThrow()
    })

    it('destroyBuffer is idempotent for the same handle', () => {
      const { renderer } = makeRenderer()
      const handle = renderer.createBuffer('vertex', 64)
      renderer.destroyBuffer(handle)
      expect(() => renderer.destroyBuffer(handle)).not.toThrow()
    })
  })

  describe('pipeline lifecycle', () => {
    it('createPipeline returns an opaque handle', () => {
      const { renderer } = makeRenderer()
      const pipeline = renderer.createPipeline({ type: 'candle' })
      expect(pipeline).toBeDefined()
      expect(typeof pipeline).toBe('object')
    })

    it('destroyPipeline is idempotent', () => {
      const { renderer } = makeRenderer()
      const pipeline = renderer.createPipeline({ type: 'line' })
      renderer.destroyPipeline(pipeline)
      expect(() => renderer.destroyPipeline(pipeline)).not.toThrow()
    })
  })

  describe('compute path (WebGL throw contract)', () => {
    it('createComputePipeline throws', () => {
      const { renderer } = makeRenderer()
      expect(() => renderer.createComputePipeline({})).toThrow(/compute/)
    })

    it('dispatchCompute throws', () => {
      const { renderer } = makeRenderer()
      const fakePipeline = { __brand: 'ComputePipelineHandle' } as any
      expect(() =>
        renderer.dispatchCompute({ pipeline: fakePipeline, workgroups: [1], bindings: {} }),
      ).toThrow(/compute/)
    })
  })

  describe('frame lifecycle', () => {
    it('beginFrame binds the region on the surface', () => {
      const { renderer, surface } = makeRenderer()
      const region: SurfaceRegion = { x: 0, y: 0, width: 800, height: 600, dpr: 2 }
      renderer.beginFrame(region)
      expect(surface.bindRegion).toHaveBeenCalledWith(region)
    })

    it('beginFrame sets region and resizes internal surfaces', () => {
      const { renderer } = makeRenderer()
      const region: SurfaceRegion = { x: 10, y: 20, width: 800, height: 600, dpr: 2 }
      renderer.beginFrame(region)
      expect(mocks.mockSetRegion).toHaveBeenCalledWith(region)
      expect(mocks.mockResize).toHaveBeenCalledWith(800, 600, 2)
    })

    it('endFrame does not throw', () => {
      const { renderer } = makeRenderer()
      expect(() => renderer.endFrame()).not.toThrow()
    })
  })

  describe('drawInstances', () => {
    it('delegates to candle surface drawRectBuffer', () => {
      const { renderer } = makeRenderer()
      const region: SurfaceRegion = { x: 0, y: 0, width: 800, height: 600, dpr: 2 }
      renderer.beginFrame(region)

      const pipeline = renderer.createPipeline({ type: 'candle' })
      const instanceBuf = renderer.createBuffer('instance', 256)
      const rects = new Float32Array([0, 0, 100, 50, 100, 0, 100, 50])
      renderer.writeBuffer(instanceBuf, rects)

      const vertices = renderer.createBuffer('vertex', 48)
      const ok = renderer.drawInstances({
        pipeline,
        vertices,
        instances: instanceBuf,
        instanceCount: 2,
        vertexCount: 6,
        uniforms: { color: '#ff0000', scrollLeft: 0 },
      })

      expect(ok).toBe(true)
      expect(mocks.mockDrawRectBuffer).toHaveBeenCalledTimes(1)
      const args = mocks.mockDrawRectBuffer.mock.calls[0]
      expect(args[0]).toBeInstanceOf(Float32Array)
      expect(args[1]).toBe(2)
      expect(args[2]).toBe('#ff0000')
      expect(args[3]).toBe(0)
    })

    it('returns true without GPU when instanceCount is zero', () => {
      const { renderer } = makeRenderer()
      renderer.beginFrame({ x: 0, y: 0, width: 100, height: 100, dpr: 1 })
      const pipeline = renderer.createPipeline({ type: 'candle' })
      const buf = renderer.createBuffer('instance', 64)
      renderer.writeBuffer(buf, new Float32Array([0, 0, 50, 50]))
      const ok = renderer.drawInstances({
        pipeline,
        vertices: buf,
        instances: buf,
        instanceCount: 0,
        vertexCount: 6,
      })
      expect(ok).toBe(true)
      expect(mocks.mockDrawRectBuffer).not.toHaveBeenCalled()
    })

    it('returns false when pipeline type mismatch (line -> instances)', () => {
      const { renderer } = makeRenderer()
      renderer.beginFrame({ x: 0, y: 0, width: 100, height: 100, dpr: 1 })
      const pipeline = renderer.createPipeline({ type: 'line' })
      const buf = renderer.createBuffer('instance', 64)
      renderer.writeBuffer(buf, new Float32Array([0, 0, 50, 50]))
      const ok = renderer.drawInstances({
        pipeline,
        vertices: buf,
        instances: buf,
        instanceCount: 1,
        vertexCount: 6,
      })
      expect(ok).toBe(false)
      expect(mocks.mockDrawRectBuffer).not.toHaveBeenCalled()
    })

    it('returns false when drawRectBuffer fails', () => {
      mocks.mockDrawRectBuffer.mockReturnValueOnce(false)
      const { renderer } = makeRenderer()
      renderer.beginFrame({ x: 0, y: 0, width: 100, height: 100, dpr: 1 })
      const pipeline = renderer.createPipeline({ type: 'candle' })
      const buf = renderer.createBuffer('instance', 64)
      renderer.writeBuffer(buf, new Float32Array([0, 0, 50, 50]))
      const ok = renderer.drawInstances({
        pipeline,
        vertices: buf,
        instances: buf,
        instanceCount: 1,
        vertexCount: 6,
      })
      expect(ok).toBe(false)
    })
  })

  describe('drawLines', () => {
    it('delegates to line surface drawLineStrips', () => {
      const { renderer } = makeRenderer()
      renderer.beginFrame({ x: 0, y: 0, width: 800, height: 600, dpr: 2 })

      const pipeline = renderer.createPipeline({ type: 'line' })
      const vertexBuf = renderer.createBuffer('vertex', 256)
      const verts = new Float32Array([10, 20, 30, 40, 50, 60])
      renderer.writeBuffer(vertexBuf, verts)

      const ok = renderer.drawLines({
        pipeline,
        vertices: vertexBuf,
        vertexCount: 3,
        topology: 'strip',
        uniforms: { color: '#00ff00', scrollLeft: 10, lineWidth: 1 },
      })

      expect(ok).toBe(true)
      expect(mocks.mockDrawLineStrips).toHaveBeenCalledTimes(1)
      const args = mocks.mockDrawLineStrips.mock.calls[0]
      expect(args[0]).toHaveLength(1)
      expect(args[0][0].color).toBe('#00ff00')
      expect(args[0][0].width).toBe(1)
      expect(args[0][0].points).toHaveLength(3)
      expect(args[1]).toBe(10)
    })

    it('batches multiple strips in one drawLineStrips call', () => {
      const { renderer } = makeRenderer()
      renderer.beginFrame({ x: 0, y: 0, width: 800, height: 600, dpr: 1 })
      const pipeline = renderer.createPipeline({ type: 'line' })
      const ok = renderer.drawLines({
        pipeline,
        strips: [
          {
            points: [
              { x: 0, y: 0 },
              { x: 1, y: 1 },
            ],
            color: '#f00',
            width: 1,
          },
          {
            points: [
              { x: 0, y: 2 },
              { x: 1, y: 3 },
              { x: 2, y: 2 },
            ],
            color: '#0f0',
            width: 2,
          },
        ],
        uniforms: { scrollLeft: 5 },
      })
      expect(ok).toBe(true)
      expect(mocks.mockDrawLineStrips).toHaveBeenCalledTimes(1)
      const lines = mocks.mockDrawLineStrips.mock.calls[0]![0]
      expect(lines).toHaveLength(2)
      expect(lines[0].color).toBe('#f00')
      expect(lines[1].color).toBe('#0f0')
      expect(lines[1].width).toBe(2)
      expect(mocks.mockDrawLineStrips.mock.calls[0]![1]).toBe(5)
    })

    it('prepares strips for physical pixels at fractional DPR', () => {
      const { renderer } = makeRenderer()
      renderer.beginFrame({ x: 0, y: 0, width: 800, height: 600, dpr: 1.25 })
      const pipeline = renderer.createPipeline({ type: 'line' })
      renderer.drawLines({
        pipeline,
        strips: [
          {
            points: [
              { x: 0.2, y: 5.1 },
              { x: 10.7, y: 5.1 },
            ],
            color: '#f00',
            width: 1,
          },
        ],
        uniforms: { scrollLeft: 0 },
      })
      const lines = mocks.mockDrawLineStrips.mock.calls[0]![0]
      expect(lines[0].width).toBe(0.8)
      expect(lines[0].points).toEqual([
        { x: 0, y: 5.2 },
        { x: 10.4, y: 5.2 },
      ])
    })

    it('preserves diagonal vertices and quantizes width at high DPR', () => {
      const { renderer } = makeRenderer()
      renderer.beginFrame({ x: 0, y: 0, width: 800, height: 600, dpr: 2 })
      const pipeline = renderer.createPipeline({ type: 'line' })
      renderer.drawLines({
        pipeline,
        strips: [
          {
            points: [
              { x: 0.2, y: 5.1 },
              { x: 10.7, y: 8.4 },
            ],
            color: '#0f0',
            width: 1,
          },
        ],
        uniforms: { scrollLeft: 0 },
      })
      const lines = mocks.mockDrawLineStrips.mock.calls[0]![0]
      expect(lines[0].width).toBe(1)
      expect(lines[0].points).toEqual([
        { x: 0.2, y: 5.1 },
        { x: 10.7, y: 8.4 },
      ])
    })

    it('delegates to line surface drawFilledBand for fill pipeline', () => {
      const { renderer } = makeRenderer()
      renderer.beginFrame({ x: 0, y: 0, width: 800, height: 600, dpr: 2 })

      const pipeline = renderer.createPipeline({ type: 'fill' })
      const vertexBuf = renderer.createBuffer('vertex', 256)
      // [upper0_x, upper0_y, lower0_x, lower0_y, upper1_x, upper1_y, ...]
      const verts = new Float32Array([0, 100, 0, 50, 100, 100, 100, 50, 200, 100, 200, 50])
      renderer.writeBuffer(vertexBuf, verts)

      renderer.drawLines({
        pipeline,
        vertices: vertexBuf,
        vertexCount: 6,
        uniforms: { color: '#0000ff', scrollLeft: 5 },
      })

      expect(mocks.mockDrawFilledBand).toHaveBeenCalledTimes(1)
      const args = mocks.mockDrawFilledBand.mock.calls[0]
      expect(args[0].upperPoints).toHaveLength(3)
      expect(args[0].lowerPoints).toHaveLength(3)
      expect(args[1]).toBe('#0000ff')
      expect(args[2]).toBe(5)
    })
  })

  describe('dispose lifecycle', () => {
    it('dispose destroys internal surfaces and the surface backend', () => {
      const { renderer, surface } = makeRenderer()
      renderer.dispose()
      expect(mocks.mockDestroyCandle).toHaveBeenCalledTimes(1)
      expect(mocks.mockDestroyLine).toHaveBeenCalledTimes(1)
      expect(surface.dispose).toHaveBeenCalledTimes(1)
    })

    it('dispose is idempotent', () => {
      const { renderer } = makeRenderer()
      renderer.dispose()
      renderer.dispose()
      expect(mocks.mockDestroyCandle).toHaveBeenCalledTimes(1)
      expect(mocks.mockDestroyLine).toHaveBeenCalledTimes(1)
    })

    it('after dispose, createBuffer throws', () => {
      const { renderer } = makeRenderer()
      renderer.dispose()
      expect(() => renderer.createBuffer('vertex', 64)).toThrow(/disposed/)
    })

    it('after dispose, createPipeline throws', () => {
      const { renderer } = makeRenderer()
      renderer.dispose()
      expect(() => renderer.createPipeline({ type: 'candle' })).toThrow(/disposed/)
    })

    it('after dispose, draw calls are no-ops', () => {
      const { renderer } = makeRenderer()
      const pipeline = renderer.createPipeline({ type: 'candle' })
      const buf = renderer.createBuffer('instance', 64)
      renderer.writeBuffer(buf, new Float32Array([0, 0, 50, 50]))

      renderer.dispose()

      expect(() =>
        renderer.beginFrame({ x: 0, y: 0, width: 100, height: 100, dpr: 1 }),
      ).not.toThrow()
      expect(() =>
        renderer.drawInstances({
          pipeline,
          vertices: buf,
          instances: buf,
          instanceCount: 1,
          vertexCount: 6,
        }),
      ).not.toThrow()
      expect(() =>
        renderer.drawLines({
          pipeline,
          vertices: buf,
          vertexCount: 2,
        }),
      ).not.toThrow()
      expect(() => renderer.endFrame()).not.toThrow()
      expect(mocks.mockDrawRectBuffer).not.toHaveBeenCalled()
    })
  })
})
