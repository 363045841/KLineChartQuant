/** 柱状几何统一映射到公共原语，所有后端输出到 Scene 当前目标。 */
import type { RenderContext } from '@/foundation/plugin/index.js'
import { primitiveSink } from '@/rendering/primitives/impl/paint.js'
import type { PaintPrimitive } from '@/rendering/primitives/types.js'
import type { WorldRectBatch } from '../types.js'
import { projectBarBatches } from './projectBars.js'

/** 世界坐标只投影一次，整数物理像素回算逻辑像素后交给公共实例管线。 */
export function projectBarPrimitives(
  batches: readonly WorldRectBatch[],
  scrollLeft: number,
  dpr: number,
): PaintPrimitive[] {
  const commands: PaintPrimitive[] = []
  for (const batch of projectBarBatches(batches, scrollLeft, dpr)) {
    for (let i = 0; i < batch.count * 4; i += 4)
      commands.push({
        kind: 'rect',
        x: batch.buf[i]! / dpr,
        y: batch.buf[i + 1]! / dpr,
        width: batch.buf[i + 2]! / dpr,
        height: batch.buf[i + 3]! / dpr,
        color: batch.color,
      })
  }
  return commands
}

/** 蜡烛和其他柱状图使用同一个有序提交入口，不存在直绘可见 GPU 的分支。 */
export function paintBarBatches(context: RenderContext, batches: readonly WorldRectBatch[]): void {
  primitiveSink(context.sceneRenderer?.primitives)(
    context.ctx,
    projectBarPrimitives(batches, context.scrollLeft, context.dpr),
    context.dpr,
  )
}
