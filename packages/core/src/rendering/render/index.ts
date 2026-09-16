/**
 * Renderer abstraction barrel.
 *
 * Exports the `SurfaceBackend` / `Renderer` contracts and the WebGL2
 * implementation of `SurfaceBackend` wrapping `SharedWebGLSurface`.
 */

export { createCanvas2DRenderer } from './backend/createCanvas2DRenderer.js'
export { createWebGLRenderer } from './backend/createWebGLRenderer.js'
export type { CreateWebGPURendererOptions } from './backend/createWebGPURenderer.js'
export { createWebGPURenderer } from './backend/createWebGPURenderer.js'
export type {
  WebGPUSurfaceBackend,
  WebGPUSurfaceBackendOptions,
} from './backend/createWebGPUSurfaceBackend.js'
export { createWebGPUSurfaceBackend } from './backend/createWebGPUSurfaceBackend.js'
export {
  createDefaultRendererHost,
  createDefaultRendererHostSync,
} from './createDefaultRendererHost.js'
export type { WebGLSurfaceBackend } from './createWebGLSurfaceBackend.js'
export { createWebGLSurfaceBackend } from './createWebGLSurfaceBackend.js'
export type { FrameMetricsSnapshot } from './frameMetrics.js'
export {
  createFrameMetrics,
  getFrameMetrics,
  resetFrameMetrics,
} from './frameMetrics.js'
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
} from './Renderer.js'
export type {
  RendererBackend,
  RendererBackendRuntime,
  RendererBackendStatus,
  RendererFactory,
  RendererHost,
  RendererHostDependencies,
  RendererHostListeners,
} from './rendererHost.js'
export { createRendererHost, createRendererHostFromRenderer } from './rendererHost.js'
export type {
  CompositeOptions,
  SurfaceBackend,
  SurfaceRegion,
  VisibleSurface,
} from './SurfaceBackend.js'
export { getVisibleCanvas, isVisibleSurface } from './SurfaceBackend.js'
