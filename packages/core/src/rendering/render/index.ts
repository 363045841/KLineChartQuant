/**
 * Renderer abstraction barrel.
 *
 * Exports the `SurfaceBackend` / `Renderer` contracts and the WebGL2
 * implementation of `SurfaceBackend` wrapping `SharedWebGLSurface`.
 */

export type { SurfaceBackend, SurfaceRegion, CompositeOptions } from './SurfaceBackend'

export { createWebGLSurfaceBackend } from './createWebGLSurfaceBackend'
export { createWebGLRenderer } from './createWebGLRenderer'
export { createWebGPUSurfaceBackend } from './createWebGPUSurfaceBackend'
export { createWebGPURenderer } from './createWebGPURenderer'
export { createCanvas2DRenderer } from './createCanvas2DRenderer'
export { createRendererHost, createRendererHostFromRenderer } from './rendererHost'
export {
  createDefaultRendererHost,
  createDefaultRendererHostSync,
} from './createDefaultRendererHost'

export type {
  RendererBackend,
  RendererBackendStatus,
  RendererBackendRuntime,
  RendererFactory,
  RendererHostDependencies,
  RendererHostListeners,
  RendererHost,
} from './rendererHost'

export type {
  WebGPUSurfaceBackend,
  WebGPUSurfaceBackendOptions,
} from './createWebGPUSurfaceBackend'
export type { CreateWebGPURendererOptions } from './createWebGPURenderer'
export {
  createFrameMetrics,
  getFrameMetrics,
  resetFrameMetrics,
} from './frameMetrics'
export type { FrameMetricsSnapshot } from './frameMetrics'

export type {
  Renderer,
  RendererCapabilities,
  BufferHandle,
  PipelineHandle,
  ComputePipelineHandle,
  BufferUsage,
  DrawInstancesParams,
  DrawLinesParams,
  DispatchComputeParams,
} from './Renderer'
