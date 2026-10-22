/** 柱状几何统一映射到公共原语：屏幕缓冲按世界缓冲复用，投影时裁掉视口外的柱。 */
import type { PrimitiveRenderContext } from '@/foundation/plugin/index.js'
import { submitPrimitives } from '@/rendering/primitives/impl/paint.js'
import type { PaintPrimitive } from '@/rendering/primitives/types.js'
import type { WorldRectBatch } from '../types.js'

/** 矩形批次原语；屏幕缓冲按下标紧凑写入，长度恒为本帧可见柱数 × 4。 */
type RectBatchPrimitive = Extract<PaintPrimitive, { kind: 'rects' }>

/** 世界缓冲对应的可复用屏幕缓冲与原语；容量只增不减。 */
interface ScreenBuffer {
  storage: Float64Array
  primitive: RectBatchPrimitive
}

/** 世界缓冲属于 Layer 并跨帧保留，因此可以安全地按它复用屏幕缓冲。 */
const screenBuffers = new WeakMap<Float64Array, ScreenBuffer>()

/**
 * 取世界缓冲对应的屏幕缓冲。
 *
 * @param world    世界坐标缓冲（Layer 持有）
 * @param required 本帧需要的 float 数
 * @returns 可写缓冲与原语对象，两者都跨帧复用
 */
function screenBuffer(world: Float64Array, required: number): ScreenBuffer {
  const existing = screenBuffers.get(world)
  if (existing) {
    if (existing.storage.length < required) {
      existing.storage = new Float64Array(
        Math.max(required, Math.ceil(existing.storage.length * 1.5)),
      )
    }
    return existing
  }
  const created: ScreenBuffer = {
    storage: new Float64Array(required),
    primitive: { kind: 'rects', data: new Float64Array(0), color: '' },
  }
  screenBuffers.set(world, created)
  return created
}

/**
 * 把世界矩形批次投影到屏幕，返回可直接提交的原语。
 *
 * 每个批次按 bar 顺序写入世界坐标；只有与视口横向相交的柱才写入屏幕缓冲，
 * 因此合批阶段看到的批次长度就是可见柱数，不会为整段历史逐根扫描。
 * 纵向裁剪留给消费端，柱体的时间轴裁剪只需要横向。
 *
 * @param batches       世界坐标批次
 * @param scrollLeft    本帧逻辑滚动量
 * @param dpr           设备像素比
 * @param viewportWidth 逻辑视口宽度
 * @returns 与视口相交的非空批次原语
 */
export function projectBarPrimitives(
  batches: readonly WorldRectBatch[],
  scrollLeft: number,
  dpr: number,
  viewportWidth: number,
): RectBatchPrimitive[] {
  const scrollPx = Math.round(scrollLeft * dpr)
  const limitPx = viewportWidth * dpr
  const commands: RectBatchPrimitive[] = []
  for (const batch of batches) {
    if (batch.count <= 0) continue
    const { storage, primitive } = screenBuffer(batch.buf, batch.count * 4)
    let written = 0
    for (let index = 0; index < batch.count; index++) {
      const source = index * 4
      const xPx = Math.round(batch.buf[source]! * dpr) - scrollPx
      const widthPx = Math.max(1, Math.round(batch.buf[source + 2]! * dpr))
      if (xPx + widthPx < 0 || xPx > limitPx) continue
      const offset = written * 4
      storage[offset] = xPx / dpr
      storage[offset + 1] = Math.round(batch.buf[source + 1]! * dpr) / dpr
      storage[offset + 2] = widthPx / dpr
      storage[offset + 3] = Math.max(1, Math.round(batch.buf[source + 3]! * dpr)) / dpr
      written++
    }
    if (written === 0) continue
    primitive.data = storage.subarray(0, written * 4)
    primitive.color = batch.color
    commands.push(primitive)
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
    projectBarPrimitives(batches, context.scrollLeft, context.dpr, context.paneWidth),
    context.dpr,
  )
}
