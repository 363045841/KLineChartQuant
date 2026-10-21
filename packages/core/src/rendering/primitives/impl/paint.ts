/** 统一原语提交入口：失败必须整批回退，避免部分提交造成透明度叠加。 */
import type { PaintPrimitive, PrimitiveBackend, PrimitiveSink } from '../types.js'
import { paintCanvasPrimitives } from './canvas.js'

/** 为当前后端建立业务无关的提交器。 */
export function primitiveSink(backend?: PrimitiveBackend): PrimitiveSink {
  return (target, primitives, dpr) => {
    if (primitives.length === 0) return
    if (backend?.paint(target, primitives, dpr)) return
    paintCanvasPrimitives(target, primitives, dpr)
  }
}

/**
 * 提交一批原语。
 *
 * Scene 渲染时注入帧内合成器，同一目标的连续图层合并成一次离屏渲染与合成；
 * 直接绘制的上下文（测试替身、基准页）没有合成器，走立即提交。
 */
export function submitPrimitives(
  context: { primitives?: PrimitiveSink; sceneRenderer?: { primitives: PrimitiveBackend } },
  target: CanvasRenderingContext2D,
  primitives: readonly PaintPrimitive[],
  dpr: number,
): void {
  if (primitives.length === 0) return
  const sink = context.primitives ?? primitiveSink(context.sceneRenderer?.primitives)
  sink(target, primitives, dpr)
}
