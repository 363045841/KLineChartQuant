/**
 * Renderer abstraction barrel.
 *
 * Exports the `SurfaceBackend` / `Renderer` contracts and the WebGL2
 * implementation of `SurfaceBackend` wrapping `SharedWebGLSurface`.
 */

export { createCanvas2DRenderer } from './backend/createCanvas2DRenderer'
export { createWebGLRenderer } from './backend/createWebGLRenderer'
export type { CreateWebGPURendererOptions } from './backend/createWebGPURenderer'
export { createWebGPURenderer } from './backend/createWebGPURenderer'
export type {
  WebGPUSurfaceBackend,
  WebGPUSurfaceBackendOptions,
} from './backend/createWebGPUSurfaceBackend'
export { createWebGPUSurfaceBackend } from './backend/createWebGPUSurfaceBackend'
export {
  createDefaultRendererHost,
  createDefaultRendererHostSync,
} from './createDefaultRendererHost'
export { createWebGLSurfaceBackend } from './createWebGLSurfaceBackend'
export type { FrameMetricsSnapshot } from './frameMetrics'
export {
  createFrameMetrics,
  getFrameMetrics,
  resetFrameMetrics,
} from './frameMetrics'
export type {
  BufferHandle,
  BufferUsage,
  ComputePipelineHandle,
  DispatchComputeParams,
  DrawInstancesParams,
  DrawLinesParams,
  PipelineHandle,
  Renderer,
  RendererCapabilities,
} from './Renderer'
export type {
  RendererBackend,
  RendererBackendRuntime,
  RendererBackendStatus,
  RendererFactory,
  RendererHost,
  RendererHostDependencies,
  RendererHostListeners,
} from './rendererHost'
export { createRendererHost, createRendererHostFromRenderer } from './rendererHost'
export type { CompositeOptions, SurfaceBackend, SurfaceRegion } from './SurfaceBackend'
