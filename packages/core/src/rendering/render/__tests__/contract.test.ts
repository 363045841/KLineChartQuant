/**
 * Type-level contract test for the Renderer abstraction.
 *
 * Approach: this file builds **minimal mock implementations** of both
 * `SurfaceBackend` and `Renderer` and assigns them to typed variables.
 * If a future change to either interface breaks contract conformance,
 * `tsc` fails at the mock's `: SurfaceBackend` annotation — the test
 * names below describe what each mock proves.
 *
 * Runtime assertions only verify the mock objects are well-formed
 * (the real point of the file is the type checks above each test).
 */

import { describe, it, expect } from 'vitest'

import type {
  SurfaceBackend,
  SurfaceRegion,
  Renderer,
  RendererCapabilities,
  BufferHandle,
  PipelineHandle,
  ComputePipelineHandle,
} from '../index'

// --- SurfaceBackend conformance ---

function makeMockSurface(): SurfaceBackend {
  let disposed = false
  let lastRegion: SurfaceRegion | null = null
  const surface: SurfaceBackend = {
    isAvailable: () => !disposed,
    resize: () => {},
    bindRegion: (region) => {
      if (disposed) return false
      lastRegion = region
      return region.width > 0 && region.height > 0
    },
    clearRegion: () => {},
    compositeTo: (ctx, region, options) => {
      // No-op for tests — the contract is that this exists and accepts
      // a CanvasRenderingContext2D + region + optional options.
      void ctx
      void region
      void options
    },
    dispose: () => {
      disposed = true
      lastRegion = null
    },
  }
  // Touch the inner state via the surface so it's not unused.
  void lastRegion
  return surface
}

describe('SurfaceBackend contract', () => {
  it('mock satisfies the interface shape', () => {
    const s = makeMockSurface()
    expect(typeof s.isAvailable).toBe('function')
    expect(typeof s.resize).toBe('function')
    expect(typeof s.bindRegion).toBe('function')
    expect(typeof s.clearRegion).toBe('function')
    expect(typeof s.compositeTo).toBe('function')
    expect(typeof s.dispose).toBe('function')
  })

  it('lifecycle: dispose then isAvailable returns false', () => {
    const s = makeMockSurface()
    expect(s.isAvailable()).toBe(true)
    s.dispose()
    expect(s.isAvailable()).toBe(false)
  })

  it('bindRegion rejects zero-area regions', () => {
    const s = makeMockSurface()
    expect(s.bindRegion({ x: 0, y: 0, width: 0, height: 100, dpr: 1 })).toBe(false)
    expect(s.bindRegion({ x: 0, y: 0, width: 100, height: 0, dpr: 1 })).toBe(false)
    expect(s.bindRegion({ x: 0, y: 0, width: 100, height: 100, dpr: 2 })).toBe(true)
  })
})

// --- Renderer conformance ---

const fakeBuffer = { __brand: 'BufferHandle' } as BufferHandle
const fakePipeline = { __brand: 'PipelineHandle' } as PipelineHandle
const fakeCompute = { __brand: 'ComputePipelineHandle' } as ComputePipelineHandle

function makeMockRenderer(surface: SurfaceBackend, computeSupported: boolean): Renderer {
  const caps: RendererCapabilities = {
    compute: computeSupported,
    storageBuffer: computeSupported,
    maxInstances: 1_000_000,
    name: computeSupported ? 'webgpu' : 'webgl2',
  }
  return {
    surface,
    caps,
    createBuffer: () => fakeBuffer,
    writeBuffer: () => {},
    destroyBuffer: () => {},
    createPipeline: () => fakePipeline,
    destroyPipeline: () => {},
    createComputePipeline: () => {
      if (!computeSupported) {
        throw new Error('compute not supported on this backend')
      }
      return fakeCompute
    },
    destroyComputePipeline: () => {},
    beginFrame: () => {},
    drawInstances: () => true,
    drawLines: () => true,
    dispatchCompute: () => {
      if (!computeSupported) {
        throw new Error('dispatchCompute requires a backend with caps.compute === true')
      }
    },
    endFrame: () => {},
    dispose: () => {},
  }
}

describe('Renderer contract', () => {
  it('mock satisfies the interface shape', () => {
    const r = makeMockRenderer(makeMockSurface(), false)
    expect(r.surface).toBeDefined()
    expect(r.caps).toBeDefined()
    expect(typeof r.createBuffer).toBe('function')
    expect(typeof r.drawInstances).toBe('function')
    expect(typeof r.dispose).toBe('function')
  })

  it('capabilities flag distinguishes backends', () => {
    const webgl = makeMockRenderer(makeMockSurface(), false)
    const webgpu = makeMockRenderer(makeMockSurface(), true)
    expect(webgl.caps.compute).toBe(false)
    expect(webgl.caps.name).toBe('webgl2')
    expect(webgpu.caps.compute).toBe(true)
    expect(webgpu.caps.name).toBe('webgpu')
  })

  it('WebGL impl must throw on createComputePipeline + dispatchCompute', () => {
    const webgl = makeMockRenderer(makeMockSurface(), false)
    expect(() => webgl.createComputePipeline({})).toThrow(/compute/)
    expect(() =>
      webgl.dispatchCompute({
        pipeline: fakeCompute,
        workgroups: [1],
        bindings: {},
      }),
    ).toThrow(/compute/)
  })

  it('WebGPU impl supports compute path without throwing', () => {
    const webgpu = makeMockRenderer(makeMockSurface(), true)
    expect(() => webgpu.createComputePipeline({})).not.toThrow()
    expect(() =>
      webgpu.dispatchCompute({
        pipeline: webgpu.createComputePipeline({}),
        workgroups: [256, 1, 1],
        bindings: { 0: fakeBuffer },
      }),
    ).not.toThrow()
  })

  it('buffer handles round-trip through write/destroy', () => {
    const r = makeMockRenderer(makeMockSurface(), false)
    const handle = r.createBuffer('vertex', 1024)
    // Buffer handle is opaque; the contract just verifies we get
    // a value and can pass it back without TypeScript complaint.
    const data = new Float32Array(256)
    expect(() => r.writeBuffer(handle, data)).not.toThrow()
    expect(() => r.writeBuffer(handle, data, 64)).not.toThrow()
    expect(() => r.destroyBuffer(handle)).not.toThrow()
  })
})
