import { describe, it, expect, vi } from 'vitest'

import { createWebGLSurfaceBackend } from '../createWebGLSurfaceBackend'
import type { SurfaceBackend, SurfaceRegion } from '../index'

function createMockSharedWebGLSurface() {
  let canvasWidth = 1
  let canvasHeight = 1
  let disposed = false
  const mockCanvas = { width: 0, height: 0 } as HTMLCanvasElement

  return {
    isAvailable: vi.fn(() => !disposed),
    resize: vi.fn((w: number, h: number, dpr: number) => {
      mockCanvas.width = Math.max(1, Math.round(w * dpr))
      mockCanvas.height = Math.max(1, Math.round(h * dpr))
      canvasWidth = mockCanvas.width
      canvasHeight = mockCanvas.height
    }),
    bindRegion: vi.fn((region: SurfaceRegion) => {
      if (disposed) return false
      return region.width > 0 && region.height > 0
    }),
    clearRegion: vi.fn((_region: SurfaceRegion) => {}),
    compositeRegionTo: vi.fn(
      (_ctx: CanvasRenderingContext2D, _region: SurfaceRegion, _options?: unknown) => {},
    ),
    destroy: vi.fn(() => {
      disposed = true
    }),
  }
}

type MockSurface = ReturnType<typeof createMockSharedWebGLSurface>

describe('WebGL SurfaceBackend adapter', () => {
  function makeBackend(): { backend: SurfaceBackend; mock: MockSurface } {
    const mock = createMockSharedWebGLSurface()
    const backend = createWebGLSurfaceBackend(mock as any)
    return { backend, mock }
  }

  it('isAvailable delegates to the underlying surface', () => {
    const { backend, mock } = makeBackend()
    expect(backend.isAvailable()).toBe(true)
    expect(mock.isAvailable).toHaveBeenCalled()
  })

  it('resize delegates to the underlying surface', () => {
    const { backend, mock } = makeBackend()
    backend.resize(800, 600, 2)
    expect(mock.resize).toHaveBeenCalledWith(800, 600, 2)
  })

  it('bindRegion delegates to the underlying surface', () => {
    const { backend, mock } = makeBackend()
    const region: SurfaceRegion = { x: 0, y: 0, width: 800, height: 600, dpr: 2 }
    const ok = backend.bindRegion(region)
    expect(ok).toBe(true)
    expect(mock.bindRegion).toHaveBeenCalledWith(region)
  })

  it('bindRegion returns false for zero-area region', () => {
    const { backend } = makeBackend()
    expect(backend.bindRegion({ x: 0, y: 0, width: 0, height: 100, dpr: 1 })).toBe(false)
    expect(backend.bindRegion({ x: 0, y: 0, width: 100, height: 0, dpr: 1 })).toBe(false)
  })

  it('clearRegion delegates to the underlying surface', () => {
    const { backend, mock } = makeBackend()
    const region: SurfaceRegion = { x: 0, y: 0, width: 800, height: 600, dpr: 2 }
    backend.clearRegion(region)
    expect(mock.clearRegion).toHaveBeenCalledWith(region)
  })

  it('compositeTo delegates to the underlying surface', () => {
    const { backend, mock } = makeBackend()
    const ctx = {} as CanvasRenderingContext2D
    const region: SurfaceRegion = { x: 0, y: 0, width: 800, height: 600, dpr: 2 }
    backend.compositeTo(ctx, region)
    expect(mock.compositeRegionTo).toHaveBeenCalledWith(ctx, region, undefined)
  })

  it('compositeTo passes options through', () => {
    const { backend, mock } = makeBackend()
    const ctx = {} as CanvasRenderingContext2D
    const region: SurfaceRegion = { x: 0, y: 0, width: 800, height: 600, dpr: 2 }
    backend.compositeTo(ctx, region, { alpha: 0.5 })
    expect(mock.compositeRegionTo).toHaveBeenCalledWith(ctx, region, { alpha: 0.5 })
  })

  it('lifecycle: dispose then isAvailable returns false', () => {
    const { backend, mock } = makeBackend()
    expect(backend.isAvailable()).toBe(true)
    backend.dispose()
    expect(backend.isAvailable()).toBe(false)
    expect(mock.destroy).toHaveBeenCalled()
  })

  it('lifecycle: after dispose all methods are no-ops', () => {
    const { backend, mock } = makeBackend()
    backend.dispose()

    expect(backend.bindRegion({ x: 0, y: 0, width: 100, height: 100, dpr: 1 })).toBe(false)
    backend.resize(800, 600, 2)
    backend.clearRegion({ x: 0, y: 0, width: 100, height: 100, dpr: 1 })
    backend.compositeTo({} as CanvasRenderingContext2D, {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      dpr: 1,
    })

    expect(mock.resize).not.toHaveBeenCalled()
    expect(mock.clearRegion).not.toHaveBeenCalled()
    expect(mock.compositeRegionTo).not.toHaveBeenCalled()
  })

  it('dispose is idempotent', () => {
    const { backend, mock } = makeBackend()
    backend.dispose()
    backend.dispose()
    expect(mock.destroy).toHaveBeenCalledTimes(1)
  })
})
