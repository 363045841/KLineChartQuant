/** WebGPU canvas 表面后端，负责物理 buffer 尺寸与 region 生命周期。 */

import type { CompositeOptions, SurfaceBackend, SurfaceRegion } from '../SurfaceBackend'
import { GPU_TEXTURE_RENDER_ATTACHMENT } from '../webgpuGlobals'

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
  const context = canvas.getContext('webgpu') as GPUCanvasContext | null
  if (!context) throw new Error('WebGPU canvas context unavailable')

  context.configure({
    device,
    format,
    alphaMode: 'premultiplied',
    usage: GPU_TEXTURE_RENDER_ATTACHMENT,
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
      // CSS 尺寸由物理 buffer 反算，避免浏览器二次缩放。
      if (canvas.style) {
        canvas.style.width = `${width / dpr}px`
        canvas.style.height = `${height / dpr}px`
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
