/** GPU 原语目标：隔离绘制后按调用顺序合成，保留主图、正式 drawing 和预览的独立生命周期。 */
import type { PrimitiveBackend } from '../types.js'
import type { PreparedPrimitive } from './prepare.js'
import { preparePrimitives } from './prepare.js'

export interface PrimitiveDevice {
  render(batch: readonly PreparedPrimitive[], width: number, height: number): HTMLCanvasElement
  dispose(): void
}

/** 延迟创建隔离设备；失败整批回退，永不向可见目标提交半批像素。 */
export function createGpuPrimitiveBackend(create: (document: Document) => PrimitiveDevice): PrimitiveBackend {
  let device: PrimitiveDevice | undefined
  let disposed = false
  return {
    paint(target, primitives, dpr) {
      if (disposed) return false
      try {
        const document = target.canvas.ownerDocument
        const width = target.canvas.width, height = target.canvas.height
        if (!document || width <= 0 || height <= 0) return false
        const batch = preparePrimitives(primitives, width, height, dpr, document)
        device ??= create(document)
        const image = device.render(batch, width, height)
        // 保留目标已有的 DPR、clip、globalAlpha 与 composite，合成顺序由业务批次决定。
        target.drawImage(image, 0, 0, width / dpr, height / dpr)
        return true
      } catch {
        device?.dispose()
        device = undefined
        return false
      }
    },
    dispose() { disposed = true; device?.dispose(); device = undefined },
  }
}
