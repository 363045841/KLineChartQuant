/** WebGPU 后端只执行统一原语，device 与离屏设备由同一生命周期释放。 */
import { createWebGPUPrimitiveBackend } from '../../primitives/impl/webgpu.js'
import { createRenderer } from '../impl/createRenderer.js'
import type { Renderer } from '../Renderer.js'

export interface CreateWebGPURendererOptions {
  gpu?: GPU
  document?: Document
  onDeviceLost?: (info: GPUDeviceLostInfo) => void
}

/** 申请设备并验证原语管线；没有额外可见 GPU canvas，也不需要截图读回。 */
export async function createWebGPURenderer(
  options: CreateWebGPURendererOptions = {},
): Promise<Renderer> {
  const gpu = options.gpu ?? globalThis.navigator?.gpu
  const document = options.document ?? globalThis.document
  if (!gpu || !document) throw new Error('WebGPU unavailable')
  const adapter = await gpu.requestAdapter()
  if (!adapter) throw new Error('WebGPU adapter unavailable')
  const device = await adapter.requestDevice()
  let disposed = false
  try {
    const renderer = createRenderer(
      'webgpu',
      createWebGPUPrimitiveBackend(device, gpu.getPreferredCanvasFormat(), document),
    )
    void device.lost.then((info) => {
      if (!disposed) options.onDeviceLost?.(info)
    })
    return {
      ...renderer,
      dispose() {
        if (disposed) return
        disposed = true
        renderer.dispose()
        device.destroy()
      },
    }
  } catch (error) {
    device.destroy()
    throw error
  }
}
