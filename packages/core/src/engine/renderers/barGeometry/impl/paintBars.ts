/** 柱状几何统一映射到公共原语，所有后端输出到 Scene 当前目标。 */
import type { RenderContext } from '@/foundation/plugin/index.js'
import { submitPrimitives } from '@/rendering/primitives/impl/paint.js'
import type { PaintPrimitive } from '@/rendering/primitives/types.js'
import type { WorldRectBatch } from '../types.js'
import { projectBarBatches } from './projectBars.js'

/**
 * 世界坐标只投影一次，量化后的整数物理像素回算逻辑像素后整批提交。
 *
 * 同色柱体是一个矩形批次而不是逐柱图元：后端一次实例化绘制，业务层不再为每根
 * 柱子分配对象，合成器也不会因为它多一次离屏提交。
 */
export function projectBarPrimitives(
  batches: readonly WorldRectBatch[],
  scrollLeft: number,
  dpr: number,
): PaintPrimitive[] {
  const commands: PaintPrimitive[] = []
  for (const batch of projectBarBatches(batches, scrollLeft, dpr)) {
    if (batch.count <= 0) continue
    const data = new Float64Array(batch.count * 4)
    for (let index = 0; index < data.length; index++) data[index] = batch.buf[index]! / dpr
    commands.push({ kind: 'rects', data, color: batch.color })
  }
  return commands
}

/** 蜡烛和其他柱状图使用同一个有序提交入口，不存在直绘可见 GPU 的分支。 */
export function paintBarBatches(context: RenderContext, batches: readonly WorldRectBatch[]): void {
  submitPrimitives(
    context,
    context.ctx,
    projectBarPrimitives(batches, context.scrollLeft, context.dpr),
    context.dpr,
  )
}
