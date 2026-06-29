/**
 * Renderer abstraction barrel.
 *
 * Exports the `SurfaceBackend` / `Renderer` contracts and the WebGL2
 * implementation of `SurfaceBackend` wrapping `SharedWebGLSurface`.
 */

export type { SurfaceBackend, SurfaceRegion, CompositeOptions } from './SurfaceBackend'

export { createWebGLSurfaceBackend } from './createWebGLSurfaceBackend'

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
