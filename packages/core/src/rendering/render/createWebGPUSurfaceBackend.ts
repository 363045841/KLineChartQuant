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
      // 可见 DOM 合成：CSS 尺寸跟逻辑 plot，buffer 跟物理像素
      if (canvas.style) {
        canvas.style.width = `${Math.max(0, widthLogical)}px`
        canvas.style.height = `${Math.max(0, heightLogical)}px`
      }
    },
    bindRegion(region: SurfaceRegion): boolean {
      if (disposed || region.width <= 0 || region.height <= 0 || region.dpr <= 0) return false
      boundRegion = { ...region }
      return true
    },
    clearRegion(_region: SurfaceRegion): void {
      if (disposed) return
      // 空数据/清屏：提交透明 clear，避免 hybrid 可见 canvas 残留上一帧
      try {
        const view = context.getCurrentTexture().createView()
        const encoder = device.createCommandEncoder()
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view,
              clearValue: { r: 0, g: 0, b: 0, a: 0 },
              loadOp: 'clear',
              storeOp: 'store',
            },
          ],
        })
        pass.end()
        device.queue.submit([encoder.finish()])
      } catch {
        // device lost / texture unavailable：忽略，下帧 beginFrame 会重建
      }
    },
    compositeTo(
      _targetCtx: CanvasRenderingContext2D,
      _region: SurfaceRegion,
      _compositeOptions?: CompositeOptions,
    ): void {
      // M2：WebGPU 可见 canvas 直接参与 DOM 分层，禁止 GPU→2D drawImage
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
