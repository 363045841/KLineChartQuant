import { describe, it, expect, vi, beforeEach } from 'vitest'

import { createWebGLRenderer } from '../createWebGLRenderer'
import type { SurfaceBackend, SurfaceRegion } from '../index'

vi.mock('../../engine/renderers/webgl/candleSurface', () => ({
  CandleWebGLSurface: class {
    isAvailable = () => false
    setRegion = vi.fn()
    resize = vi.fn()
    clear = vi.fn()
    drawRectBuffer = vi.fn()
    destroy = vi.fn()
  },
  LineWebGLSurface: class {
    isAvailable = () => false
    setRegion = vi.fn()
    resize = vi.fn()
    clear = vi.fn()
    drawLineStrips = vi.fn()
    drawFilledBand = vi.fn()
    destroy = vi.fn()
  },
}))

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
    isAvailable: vi.fn(() => false),
    getGL: vi.fn(() => null),
    getCanvas: vi.fn(() => ({ width: 0, height: 0 }) as HTMLCanvasElement),
    resize: vi.fn(),
    bindRegion: vi.fn(() => false),
    clearRegion: vi.fn(),
    compositeRegionTo: vi.fn(),
    getPhysicalRegion: vi.fn(() => null),
    destroy: vi.fn(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('fail-closed when GPU surfaces unavailable', () => {
  describe('drawLines — line type', () => {
    it('returns false when lineSurface unavailable', () => {
      const surface = createMockSurfaceBackend()
      const glSurface = createMockSharedWebGLSurface()
      const renderer = createWebGLRenderer(surface, glSurface as any)

      renderer.beginFrame({ x: 0, y: 0, width: 100, height: 100, dpr: 1 })

      const pipeline = renderer.createPipeline({ type: 'line' })
      const vertexBuf = renderer.createBuffer('vertex', 256)
      const verts = new Float32Array([10, 20, 30, 40, 50, 60])
      renderer.writeBuffer(vertexBuf, verts)

      const ok = renderer.drawLines({
        pipeline,
        vertices: vertexBuf,
        vertexCount: 3,
        uniforms: { color: '#00ff00', scrollLeft: 5, lineWidth: 2 },
      })

      expect(ok).toBe(false)
    })

    it('returns false on drawLines with no lineSurface', () => {
      const surface = createMockSurfaceBackend()
      const glSurface = createMockSharedWebGLSurface()
      const renderer = createWebGLRenderer(surface, glSurface as any)

      renderer.beginFrame({ x: 0, y: 0, width: 100, height: 100, dpr: 1 })
      const pipeline = renderer.createPipeline({ type: 'line' })
      const vertexBuf = renderer.createBuffer('vertex', 256)
      renderer.writeBuffer(vertexBuf, new Float32Array([0, 0, 100, 100]))

      expect(renderer.drawLines({ pipeline, vertices: vertexBuf, vertexCount: 2 })).toBe(false)
    })
  })

  describe('drawLines — fill type', () => {
    it('returns false when lineSurface unavailable', () => {
      const surface = createMockSurfaceBackend()
      const glSurface = createMockSharedWebGLSurface()
      const renderer = createWebGLRenderer(surface, glSurface as any)

      renderer.beginFrame({ x: 0, y: 0, width: 100, height: 100, dpr: 1 })

      const pipeline = renderer.createPipeline({ type: 'fill' })
      const vertexBuf = renderer.createBuffer('vertex', 256)
      const verts = new Float32Array([0, 100, 0, 50, 100, 100, 100, 50, 200, 100, 200, 50])
      renderer.writeBuffer(vertexBuf, verts)

      const ok = renderer.drawLines({
        pipeline,
        vertices: vertexBuf,
        vertexCount: 6,
        uniforms: { color: '#0000ff', scrollLeft: 5 },
      })

      expect(ok).toBe(false)
    })
  })

  describe('drawInstances', () => {
    it('returns false when candleSurface unavailable', () => {
      const surface = createMockSurfaceBackend()
      const glSurface = createMockSharedWebGLSurface()
      const renderer = createWebGLRenderer(surface, glSurface as any)

      renderer.beginFrame({ x: 0, y: 0, width: 100, height: 100, dpr: 1 })

      const pipeline = renderer.createPipeline({ type: 'candle' })
      const instanceBuf = renderer.createBuffer('instance', 256)
      const rects = new Float32Array([10, 20, 30, 40, 60, 70, 20, 10])
      renderer.writeBuffer(instanceBuf, rects)

      const ok = renderer.drawInstances({
        pipeline,
        vertices: instanceBuf,
        instances: instanceBuf,
        instanceCount: 2,
        vertexCount: 6,
        uniforms: { color: '#ff0000', scrollLeft: 5 },
      })

      expect(ok).toBe(false)
    })
  })

  describe('dispose behaviour', () => {
    it('after dispose, draw calls are no-ops / false', () => {
      const surface = createMockSurfaceBackend()
      const glSurface = createMockSharedWebGLSurface()
      const renderer = createWebGLRenderer(surface, glSurface as any)

      const pipeline = renderer.createPipeline({ type: 'line' })
      const vertexBuf = renderer.createBuffer('vertex', 256)
      renderer.writeBuffer(vertexBuf, new Float32Array([0, 0, 100, 100]))

      renderer.dispose()

      expect(() =>
        renderer.drawLines({ pipeline, vertices: vertexBuf, vertexCount: 2 }),
      ).not.toThrow()
      expect(renderer.drawLines({ pipeline, vertices: vertexBuf, vertexCount: 2 })).toBe(false)
    })
  })
})
