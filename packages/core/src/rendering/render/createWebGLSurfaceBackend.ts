import { SharedWebGLSurface } from '../../engine/renderers/webgl/sharedWebGLSurface'

import type { SurfaceBackend, SurfaceRegion, CompositeOptions } from './SurfaceBackend'

export function createWebGLSurfaceBackend(surface: SharedWebGLSurface): SurfaceBackend {
  let disposed = false

  return {
    isAvailable(): boolean {
      if (disposed) return false
      return surface.isAvailable()
    },

    resize(widthLogical: number, heightLogical: number, dpr: number): void {
      if (disposed) return
      surface.resize(widthLogical, heightLogical, dpr)
    },

    bindRegion(region: SurfaceRegion): boolean {
      if (disposed) return false
      return surface.bindRegion(region)
    },

    clearRegion(region: SurfaceRegion): void {
      if (disposed) return
      surface.clearRegion(region)
    },

    compositeTo(
      targetCtx: CanvasRenderingContext2D,
      region: SurfaceRegion,
      options?: CompositeOptions,
    ): void {
      if (disposed) return
      surface.compositeRegionTo(targetCtx, region, options)
    },

    dispose(): void {
      if (disposed) return
      disposed = true
      surface.destroy()
    },
  }
}
