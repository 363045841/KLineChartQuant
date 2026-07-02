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

function makeMockFallbackCtx() {
  return {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    fillRect: vi.fn(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Canvas2D fallback', () => {
  it('setFallbackContext stores the context and dpr', () => {
    const surface = createMockSurfaceBackend()
    const glSurface = createMockSharedWebGLSurface()
    const renderer = createWebGLRenderer(surface, glSurface as any)
    const ctx = makeMockFallbackCtx()

    expect(() => (renderer as any).setFallbackContext(ctx, 2)).not.toThrow()
  })

  it('setFallbackContext with null clears the fallback', () => {
    const surface = createMockSurfaceBackend()
    const glSurface = createMockSharedWebGLSurface()
    const renderer = createWebGLRenderer(surface, glSurface as any)

    expect(() => (renderer as any).setFallbackContext(null, 1)).not.toThrow()
  })

  describe('drawLines — line type', () => {
    it('draws a polyline on the fallback context when WebGL is unavailable', () => {
      const surface = createMockSurfaceBackend()
      const glSurface = createMockSharedWebGLSurface()
      const renderer = createWebGLRenderer(surface, glSurface as any)
      const ctx = makeMockFallbackCtx()
      ;(renderer as any).setFallbackContext(ctx, 1)

      renderer.beginFrame({ x: 0, y: 0, width: 100, height: 100, dpr: 1 })

      const pipeline = renderer.createPipeline({ type: 'line' })
      const vertexBuf = renderer.createBuffer('vertex', 256)
      const verts = new Float32Array([10, 20, 30, 40, 50, 60])
      renderer.writeBuffer(vertexBuf, verts)

      renderer.drawLines({
        pipeline,
        vertices: vertexBuf,
        vertexCount: 3,
        uniforms: { color: '#00ff00', scrollLeft: 5, lineWidth: 2 },
      })

      expect(ctx.beginPath).toHaveBeenCalledTimes(1)
      expect(ctx.moveTo).toHaveBeenCalledWith(5, 20)
      expect(ctx.lineTo).toHaveBeenCalledWith(25, 40)
      expect(ctx.lineTo).toHaveBeenCalledWith(45, 60)
      expect(ctx.strokeStyle).toBe('#00ff00')
      expect(ctx.lineWidth).toBe(2)
      expect(ctx.stroke).toHaveBeenCalledTimes(1)
    })

    it('no-ops on drawLines with no fallback context', () => {
      const surface = createMockSurfaceBackend()
      const glSurface = createMockSharedWebGLSurface()
      const renderer = createWebGLRenderer(surface, glSurface as any)

      renderer.beginFrame({ x: 0, y: 0, width: 100, height: 100, dpr: 1 })
      const pipeline = renderer.createPipeline({ type: 'line' })
      const vertexBuf = renderer.createBuffer('vertex', 256)
      renderer.writeBuffer(vertexBuf, new Float32Array([0, 0, 100, 100]))

      expect(() =>
        renderer.drawLines({ pipeline, vertices: vertexBuf, vertexCount: 2 }),
      ).not.toThrow()
    })
  })

  describe('drawLines — fill type', () => {
    it('draws a filled band on the fallback context', () => {
      const surface = createMockSurfaceBackend()
      const glSurface = createMockSharedWebGLSurface()
      const renderer = createWebGLRenderer(surface, glSurface as any)
      const ctx = makeMockFallbackCtx()
      ;(renderer as any).setFallbackContext(ctx, 1)

      renderer.beginFrame({ x: 0, y: 0, width: 100, height: 100, dpr: 1 })

      const pipeline = renderer.createPipeline({ type: 'fill' })
      const vertexBuf = renderer.createBuffer('vertex', 256)
      const verts = new Float32Array([0, 100, 0, 50, 100, 100, 100, 50, 200, 100, 200, 50])
      renderer.writeBuffer(vertexBuf, verts)

      renderer.drawLines({
        pipeline,
        vertices: vertexBuf,
        vertexCount: 6,
        uniforms: { color: '#0000ff', scrollLeft: 5 },
      })

      expect(ctx.beginPath).toHaveBeenCalledTimes(1)
      expect(ctx.moveTo).toHaveBeenCalledWith(-5, 100)
      expect(ctx.lineTo).toHaveBeenCalledWith(95, 100)
      expect(ctx.lineTo).toHaveBeenCalledWith(195, 100)
      expect(ctx.lineTo).toHaveBeenCalledWith(195, 50)
      expect(ctx.lineTo).toHaveBeenCalledWith(95, 50)
      expect(ctx.lineTo).toHaveBeenCalledWith(-5, 50)
      expect(ctx.closePath).toHaveBeenCalledTimes(1)
      expect(ctx.fillStyle).toBe('#0000ff')
      expect(ctx.fill).toHaveBeenCalledTimes(1)
    })
  })

  describe('drawInstances', () => {
    it('draws rectangles on the fallback context', () => {
      const surface = createMockSurfaceBackend()
      const glSurface = createMockSharedWebGLSurface()
      const renderer = createWebGLRenderer(surface, glSurface as any)
      const ctx = makeMockFallbackCtx()
      ;(renderer as any).setFallbackContext(ctx, 1)

      renderer.beginFrame({ x: 0, y: 0, width: 100, height: 100, dpr: 1 })

      const pipeline = renderer.createPipeline({ type: 'candle' })
      const instanceBuf = renderer.createBuffer('instance', 256)
      const rects = new Float32Array([10, 20, 30, 40, 60, 70, 20, 10])
      renderer.writeBuffer(instanceBuf, rects)

      renderer.drawInstances({
        pipeline,
        vertices: instanceBuf,
        instances: instanceBuf,
        instanceCount: 2,
        vertexCount: 6,
        uniforms: { color: '#ff0000', scrollLeft: 5 },
      })

      expect(ctx.fillRect).toHaveBeenCalledTimes(2)
      expect(ctx.fillRect).toHaveBeenNthCalledWith(1, 5, 20, 30, 40)
      expect(ctx.fillRect).toHaveBeenNthCalledWith(2, 55, 70, 20, 10)
      expect(ctx.fillStyle).toBe('#ff0000')
    })
  })

  describe('dispose behaviour', () => {
    it('after dispose, fallback draw calls are no-ops', () => {
      const surface = createMockSurfaceBackend()
      const glSurface = createMockSharedWebGLSurface()
      const renderer = createWebGLRenderer(surface, glSurface as any)
      const ctx = makeMockFallbackCtx()
      ;(renderer as any).setFallbackContext(ctx, 1)

      const pipeline = renderer.createPipeline({ type: 'line' })
      const vertexBuf = renderer.createBuffer('vertex', 256)
      renderer.writeBuffer(vertexBuf, new Float32Array([0, 0, 100, 100]))

      renderer.dispose()

      expect(() =>
        renderer.drawLines({ pipeline, vertices: vertexBuf, vertexCount: 2 }),
      ).not.toThrow()
      expect(ctx.stroke).not.toHaveBeenCalled()
    })
  })
})
