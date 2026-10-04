/** 矩形共用绘制入口：双精度世界几何只投影一次，所有后端消费同一屏幕批次。 */
import type { RenderContext } from '../../foundation/plugin/index.js'
import type { BufferHandle, PipelineHandle, Renderer } from '../../rendering/render/Renderer.js'
import { projectBarBatches } from './barGeometry/impl/projectBars.js'
import type { ScreenRectBatch, WorldRectBatch } from './barGeometry/types.js'

type RectGpuCache = {
  pipeline: PipelineHandle
  unit: BufferHandle
}

const rectCacheByRenderer = new WeakMap<Renderer, RectGpuCache>()

function ensureRectCache(renderer: Renderer): RectGpuCache {
  let cache = rectCacheByRenderer.get(renderer)
  if (!cache) {
    cache = {
      pipeline: renderer.createPipeline({ type: 'candle' }),
      unit: renderer.createBuffer('vertex', 64),
    }
    rectCacheByRenderer.set(renderer, cache)
  }
  return cache
}

/**
 * 经 Renderer.drawInstances 绘制整数屏幕物理像素批次。
 * 任一非空 batch 失败 → false。
 * instance buffer 每 batch 独立创建，避免同 frame 内不同绘制目标互相覆盖。
 */
export function drawRectBatchesViaRenderer(
  renderer: Renderer,
  batches: ReadonlyArray<ScreenRectBatch>,
): boolean {
  if (!renderer.surface.isAvailable()) return false

  try {
    const cache = ensureRectCache(renderer)
    for (const batch of batches) {
      if (batch.count <= 0) continue
      const byteLength = batch.count * 4 * 4
      const instances = renderer.createBuffer('instance', byteLength)
      let ok: boolean
      try {
        renderer.writeBuffer(instances, batch.buf.subarray(0, batch.count * 4))
        ok = renderer.drawInstances({
          pipeline: cache.pipeline,
          vertices: cache.unit,
          instances,
          instanceCount: batch.count,
          vertexCount: 6,
          physicalPixels: true,
          uniforms: { color: batch.color },
        })
      } finally {
        renderer.destroyBuffer(instances)
      }
      if (!ok) return false
    }
    return true
  } catch {
    return false
  }
}

/** 统一投影后优先使用可用 Renderer；不可用时 Canvas2D 绘制完全相同的矩形。 */
export function drawWorldRectBatches(
  context: RenderContext,
  batches: readonly WorldRectBatch[],
): void {
  const screen = projectBarBatches(batches, context.scrollLeft, context.dpr)
  if (screen.length === 0) return
  if (context.sceneRenderer && drawRectBatchesViaRenderer(context.sceneRenderer, screen)) return
  for (const batch of screen) {
    context.ctx.fillStyle = batch.color
    for (let offset = 0; offset < batch.count * 4; offset += 4) {
      context.ctx.fillRect(
        batch.buf[offset]! / context.dpr,
        batch.buf[offset + 1]! / context.dpr,
        batch.buf[offset + 2]! / context.dpr,
        batch.buf[offset + 3]! / context.dpr,
      )
    }
  }
}
