/** 将 SharedWebGLSurface 适配为统一的 SurfaceBackend 生命周期契约。 */

import { SharedWebGLSurface } from '../../engine/renderers/webgl/sharedWebGLSurface.js'

import type { CompositeOptions, SurfaceRegion, VisibleSurface } from './SurfaceBackend.js'

/** WebGL surface 对外暴露底层 canvas，供图表直接叠放到 2D canvas 下方。 */
export type WebGLSurfaceBackend = VisibleSurface

export function createWebGLSurfaceBackend(surface: SharedWebGLSurface): WebGLSurfaceBackend {
  let disposed = false

  return {
    canvas: surface.getCanvas(),
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
