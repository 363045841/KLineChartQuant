/** 将 SharedWebGLSurface 适配为统一的 SurfaceBackend 生命周期契约。 */

import { SharedWebGLSurface } from '../../engine/renderers/webgl/sharedWebGLSurface.js'

import type { SurfaceRegion, VisibleSurface } from './SurfaceBackend.js'
import { GENERIC_ERROR_CODES, KLineChartError } from '../../errors.js'
import { copyCanvasFrame } from './frameCapture/impl/copyCanvasFrame.js'

/** WebGL surface 对外暴露底层 canvas，供图表直接叠放到 2D canvas 下方。 */
export type WebGLSurfaceBackend = VisibleSurface

export function createWebGLSurfaceBackend(surface: SharedWebGLSurface): WebGLSurfaceBackend {
  let disposed = false

  return {
    canvas: surface.getCanvas(),
    /** 完整帧已 resolve 到保留的绘制缓冲，立即复制可见像素。 */
    async captureFrame(): Promise<HTMLCanvasElement> {
      if (disposed || !surface.isAvailable()) {
        throw new KLineChartError(GENERIC_ERROR_CODES.DISPOSED, 'WebGL 截图表面不可用')
      }
      return copyCanvasFrame(surface.getCanvas())
    },
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

    dispose(): void {
      if (disposed) return
      disposed = true
      surface.destroy()
    },
  }
}
