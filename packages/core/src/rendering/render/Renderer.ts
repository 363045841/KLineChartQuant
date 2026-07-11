/**
 * High-level renderer interface — the drawing primitives the chart's
 * scene layers (candles, volume, indicators, drawings) call into.
 *
 * Both the existing WebGL renderer (currently spread across
 * `src/core/renderers/{candle,subVolume,crosshair,...}.ts`) and the
 * P1 WebGPU renderer implement this contract. v0's WebGL path will
 * be refactored to fit behind it in a follow-up PR (this file ships
 * the contract first; the legacy code is unchanged until the next
 * step is approved).
 *
 * Design notes:
 * - `drawInstances` is the workhorse: render N copies of a unit geometry
 *   parameterized by an instance buffer. K-lines, volume bars, footprint
 *   cells, heatmap tiles all reduce to instanced primitives — see
 *   `docs/ROADMAP.md` §2.3 for the K-line example.
 * - `drawLines` covers MA-style continuous polylines, drawings, axes.
 * - `dispatchCompute` exists only because WebGPU has compute shaders;
 *   the WebGL implementation throws on call so callers can feature-detect
 *   via `caps.compute`. Volume Profile binning, M4 downsampling, footprint
 *   aggregation will use it on the WebGPU path.
 * - `setUniforms` is intentionally schemaless on the interface — the
 *   uniform layout is owned by each shader/program. Callers pass a
 *   structured object that the backend translates into uniform writes.
 *
 * This file is **pure interface** in this PR; behaviour comes in the
 * next two PRs (Scale interfaces, then a Renderer impl that wraps
 * the existing WebGL primitives).
 */

import type { SurfaceBackend, SurfaceRegion } from './SurfaceBackend'

/** Reported by the backend so feature-conditional code can branch. */
export type RendererCapabilities = {
  /** WebGPU compute shaders available. WebGL backends report false. */
  compute: boolean
  /** Storage buffers usable as ring buffers / scatter-add targets. */
  storageBuffer: boolean
  /** Maximum elements per drawInstances call (engine-imposed cap). */
  maxInstances: number
  /** Friendly name, e.g. "webgl2" or "webgpu". */
  name: string
}

/** Vertex/instance buffer wrapper. Backends own the GPU handle. */
export type BufferHandle = { readonly __brand: 'BufferHandle' }
/** Pipeline / shader program wrapper. */
export type PipelineHandle = { readonly __brand: 'PipelineHandle' }
/** Compute shader handle (WebGPU only). */
export type ComputePipelineHandle = { readonly __brand: 'ComputePipelineHandle' }

export type BufferUsage = 'vertex' | 'instance' | 'index' | 'uniform' | 'storage'

export type DrawInstancesParams = {
  pipeline: PipelineHandle
  /** Unit-geometry buffer (e.g. a single rectangle) shared across instances. */
  vertices: BufferHandle
  /** Per-instance attribute buffer (e.g. one row per K-line). */
  instances: BufferHandle
  /** Number of instances to draw. */
  instanceCount: number
  /** Vertices per instance (e.g. 4 for a quad, 6 if using triangles). */
  vertexCount: number
  /** Uniform block — opaque object the backend reads. */
  uniforms?: Record<string, unknown>
}

export type DrawLinesParams = {
  pipeline: PipelineHandle
  vertices: BufferHandle
  vertexCount: number
  /** Line strip vs disconnected segments. */
  topology?: 'strip' | 'list'
  uniforms?: Record<string, unknown>
}

export type DispatchComputeParams = {
  pipeline: ComputePipelineHandle
  /** Workgroup counts per axis. */
  workgroups: [number, number?, number?]
  /** Input/output buffer bindings, keyed by binding index. */
  bindings: Record<number, BufferHandle>
  uniforms?: Record<string, unknown>
}

/**
 * The drawing-primitives interface every backend implements.
 *
 * Backends own the GPU resources; callers receive opaque handles
 * (`BufferHandle`, `PipelineHandle`) and pass them back for draws.
 */
export interface Renderer {
  /** Underlying surface (for region binding and final composite). */
  readonly surface: SurfaceBackend

  /** Reported feature flags — caller branches on `caps.compute` etc. */
  readonly caps: RendererCapabilities

  // --- resource lifecycle ---

  createBuffer(usage: BufferUsage, sizeBytes: number): BufferHandle
  writeBuffer(handle: BufferHandle, data: ArrayBufferView, offsetBytes?: number): void
  destroyBuffer(handle: BufferHandle): void

  /**
   * Compile a shader pipeline. The exact pipeline descriptor is backend-specific;
   * adapters typically expose factory helpers (e.g. `createCandlePipeline`) that
   * internally call this with the right vertex/fragment sources.
   */
  createPipeline(descriptor: unknown): PipelineHandle
  destroyPipeline(handle: PipelineHandle): void

  /** WebGPU only — WebGL implementations MUST throw with a clear message. */
  createComputePipeline(descriptor: unknown): ComputePipelineHandle
  destroyComputePipeline(handle: ComputePipelineHandle): void

  // --- frame ---

  beginFrame(region: SurfaceRegion): void
  drawInstances(params: DrawInstancesParams): void
  drawLines(params: DrawLinesParams): void
  /** WebGPU only — WebGL implementations MUST throw. Caller checks caps first. */
  dispatchCompute(params: DispatchComputeParams): void
  endFrame(): void

  dispose(): void
}
