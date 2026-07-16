import type { CompositeOptions, SurfaceBackend, SurfaceRegion } from './SurfaceBackend'

export type WebGPUSurfaceBackend = SurfaceBackend & {
  readonly canvas: HTMLCanvasElement
  readonly device: GPUDevice
  readonly format: GPUTextureFormat
  getBoundRegion(): SurfaceRegion | null
  getCurrentTextureView(): GPUTextureView | null
}

export type WebGPUSurfaceBackendOptions = {
  canvas: HTMLCanvasElement
  device: GPUDevice
  format: GPUTextureFormat
}

export function createWebGPUSurfaceBackend(
  options: WebGPUSurfaceBackendOptions,
): WebGPUSurfaceBackend {
  const { canvas, device, format } = options
  const context = canvas.getContext('webgpu')
  if (!context) throw new Error('WebGPU canvas context unavailable')

  const renderAttachmentUsage = globalThis.GPUTextureUsage?.RENDER_ATTACHMENT ?? 0x10
  context.configure({
    device,
    format,
    alphaMode: 'premultiplied',
    usage: renderAttachmentUsage,
  })

  let disposed = false
  let boundRegion: SurfaceRegion | null = null

  return {
    canvas,
    device,
    format,
    isAvailable(): boolean {
      return !disposed
    },
    resize(widthLogical: number, heightLogical: number, dpr: number): void {
      if (disposed) return
      const width = Math.max(1, Math.round(widthLogical * dpr))
      const height = Math.max(1, Math.round(heightLogical * dpr))
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height
    },
    bindRegion(region: SurfaceRegion): boolean {
      if (disposed || region.width <= 0 || region.height <= 0 || region.dpr <= 0) return false
      boundRegion = { ...region }
      return true
    },
    clearRegion(_region: SurfaceRegion): void {},
    compositeTo(
      targetCtx: CanvasRenderingContext2D,
      region: SurfaceRegion,
      compositeOptions?: CompositeOptions,
    ): void {
      if (disposed || region.width <= 0 || region.height <= 0) return
      const sx = Math.round(region.x * region.dpr)
      const sy = Math.round(region.y * region.dpr)
      const sw = Math.round(region.width * region.dpr)
      const sh = Math.round(region.height * region.dpr)

      targetCtx.save()
      targetCtx.setTransform(1, 0, 0, 1, 0, 0)
      if (compositeOptions?.alpha !== undefined) {
        targetCtx.globalAlpha *= compositeOptions.alpha
      }
      if (compositeOptions?.imageSmoothingEnabled !== undefined) {
        targetCtx.imageSmoothingEnabled = compositeOptions.imageSmoothingEnabled
      }
      targetCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh)
      targetCtx.restore()
    },
    getBoundRegion(): SurfaceRegion | null {
      return boundRegion ? { ...boundRegion } : null
    },
    getCurrentTextureView(): GPUTextureView | null {
      if (disposed) return null
      try {
        return context.getCurrentTexture().createView()
      } catch {
        return null
      }
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      boundRegion = null
      context.unconfigure()
    },
  }
}
