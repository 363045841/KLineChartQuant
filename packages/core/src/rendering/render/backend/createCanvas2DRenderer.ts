/** Canvas2D 后端实现，仅提供资源生命周期与降级契约。 */

import type {
  BufferHandle,
  BufferUsage,
  ComputePipelineHandle,
  DispatchComputeParams,
  DrawInstancesParams,
  DrawLinesParams,
  PipelineHandle,
  Renderer,
} from '../Renderer'
import type { SurfaceBackend } from '../SurfaceBackend'

export function createCanvas2DRenderer(): Renderer {
  let disposed = false
  const buffers = new WeakSet<object>()
  const pipelines = new WeakSet<object>()

  const surface: SurfaceBackend = {
    isAvailable: () => false,
    resize: () => {},
    bindRegion: () => false,
    clearRegion: () => {},
    compositeTo: () => {},
    dispose: () => {},
  }

  function assertActive(): void {
    if (disposed) throw new Error('Renderer is disposed')
  }

  return {
    surface,
    caps: {
      compute: false,
      storageBuffer: false,
      maxInstances: 0,
      name: 'canvas2d',
    },
    createBuffer(_usage: BufferUsage, _sizeBytes: number): BufferHandle {
      assertActive()
      const handle = {}
      buffers.add(handle)
      return handle as BufferHandle
    },
    writeBuffer(handle: BufferHandle): void {
      if (disposed || !buffers.has(handle as object)) return
    },
    destroyBuffer(handle: BufferHandle): void {
      if (disposed) return
      buffers.delete(handle as object)
    },
    createPipeline(_descriptor: unknown): PipelineHandle {
      assertActive()
      const handle = {}
      pipelines.add(handle)
      return handle as PipelineHandle
    },
    destroyPipeline(handle: PipelineHandle): void {
      if (disposed) return
      pipelines.delete(handle as object)
    },
    createComputePipeline(_descriptor: unknown): ComputePipelineHandle {
      throw new Error('compute not supported on Canvas2D backend (caps.compute === false)')
    },
    destroyComputePipeline(_handle: ComputePipelineHandle): void {},
    beginFrame(): void {},
    drawInstances(_params: DrawInstancesParams): boolean {
      return false
    },
    drawLines(_params: DrawLinesParams): boolean {
      return false
    },
    dispatchCompute(_params: DispatchComputeParams): void {
      throw new Error('dispatchCompute requires a backend with caps.compute === true')
    },
    endFrame(): void {},
    dispose(): void {
      if (disposed) return
      disposed = true
      surface.dispose()
    },
  }
}
