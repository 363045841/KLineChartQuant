/** 统一原语提交入口：失败必须整批回退，避免部分提交造成透明度叠加。 */
import type { PrimitiveBackend, PrimitiveSink } from '../types.js'
import { paintCanvasPrimitives } from './canvas.js'

/** 为当前后端建立业务无关的提交器。 */
export function primitiveSink(backend?: PrimitiveBackend): PrimitiveSink {
  return (target, primitives, dpr) => {
    if (primitives.length === 0) return
    if (backend?.paint(target, primitives, dpr)) return
    paintCanvasPrimitives(target, primitives, dpr)
  }
}
