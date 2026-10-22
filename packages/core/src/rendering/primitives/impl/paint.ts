/** 统一原语提交入口：失败必须整批回退，避免部分提交造成透明度叠加。 */
import type { DataTransform } from '@/foundation/plugin/types.js'
import type { PaintPrimitive, PrimitiveBackend, PrimitivePaint, PrimitiveSink } from '../types.js'
import { paintCanvasPrimitives } from './canvas.js'

/** 为当前后端建立业务无关的提交器。 */
export function primitiveSink(backend?: PrimitiveBackend): PrimitiveSink {
  return (target, primitives, dpr, transform) => {
    if (primitives.length === 0) return
    if (backend?.paint(target, primitives, dpr, transform)) return
    paintCanvasPrimitives(target, primitives, dpr, transform)
  }
}

/**
 * 提交一批原语。
 *
 * `primitives` 恒为 Scene 绑定目标的提交器，纯增量图层与带 ctx 的图层调用方式一致；
 * 只有脱离 Scene 的直接绘制（测试、独立渲染）才回落到 sceneRenderer + ctx。
 * 两者都没有说明调用方绕过了绘制契约，直接报错而不是静默丢图。
 */
export function submitPrimitives(
  context: {
    primitives?: PrimitivePaint
    sceneRenderer?: { primitives: PrimitiveBackend }
    ctx?: CanvasRenderingContext2D
    dataTransform?: DataTransform
  },
  primitives: readonly PaintPrimitive[],
  dpr: number,
): void {
  if (primitives.length === 0) return
  const transform = context.dataTransform
  if (context.primitives) {
    context.primitives(primitives, dpr, transform)
    return
  }
  if (context.ctx) {
    primitiveSink(context.sceneRenderer?.primitives)(context.ctx, primitives, dpr, transform)
    return
  }
  throw new Error('原语提交缺少绘制目标')
}
