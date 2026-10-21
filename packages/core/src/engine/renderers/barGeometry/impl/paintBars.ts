/** 柱状几何统一映射到公共原语，所有后端输出到 Scene 当前目标。 */
import type { PrimitiveRenderContext } from '@/foundation/plugin/index.js'
import { submitPrimitives } from '@/rendering/primitives/impl/paint.js'
import type { PaintPrimitive } from '@/rendering/primitives/types.js'
import type { WorldRectBatch } from '../types.js'

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
  const scrollPx = Math.round(scrollLeft * dpr)
  for (const batch of batches) {
    if (batch.count <= 0) continue
    const data = new Float64Array(batch.count * 4)
    // 一次量化直接写入最终坐标，跳过中间 Float32 批次和第二遍除法。
    for (let index = 0; index < data.length; index += 4) {
      const source = index
      data[index] = (Math.round(batch.buf[source]! * dpr) - scrollPx) / dpr
      data[index + 1] = Math.round(batch.buf[source + 1]! * dpr) / dpr
      data[index + 2] = Math.max(1, Math.round(batch.buf[source + 2]! * dpr)) / dpr
      data[index + 3] = Math.max(1, Math.round(batch.buf[source + 3]! * dpr)) / dpr
    }
    commands.push({ kind: 'rects', data, color: batch.color })
  }
  return commands
}

/** 蜡烛和其他柱状图使用同一个有序提交入口，不存在直绘可见 GPU 的分支。 */
export function paintBarBatches(
  context: PrimitiveRenderContext,
  batches: readonly WorldRectBatch[],
): void {
  submitPrimitives(
    context,
    projectBarPrimitives(batches, context.scrollLeft, context.dpr),
    context.dpr,
  )
}
