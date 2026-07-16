import type { RenderContext } from '../../foundation/plugin/index'
import type { BufferHandle, PipelineHandle, Renderer } from '../../rendering/render/Renderer'
import { compositeSceneRenderer } from './linesViaRenderer'

export type RectBatch = {
  buf: Float32Array
  count: number
  color: string
}

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
 * 经 Renderer.drawInstances 画多组矩形（volume / MACD bar / candle 共用）。
 * 任一非空 batch 失败 → false。不负责 composite。
 * instance buffer 每 batch 独立创建，避免同 frame 内不同绘制目标互相覆盖。
 */
export function drawRectBatchesViaRenderer(
  renderer: Renderer,
  batches: ReadonlyArray<RectBatch>,
  scrollLeft: number,
): boolean {
  if (!renderer.surface.isAvailable()) return false

  try {
    const cache = ensureRectCache(renderer)
    for (const batch of batches) {
      if (batch.count <= 0) continue
      const byteLength = batch.count * 4 * 4
      const instances = renderer.createBuffer('instance', byteLength)
      renderer.writeBuffer(instances, batch.buf.subarray(0, batch.count * 4))
      const ok = renderer.drawInstances({
        pipeline: cache.pipeline,
        vertices: cache.unit,
        instances,
        instanceCount: batch.count,
        vertexCount: 6,
        uniforms: { color: batch.color, scrollLeft },
      })
      renderer.destroyBuffer(instances)
      if (!ok) return false
    }
    return true
  } catch {
    return false
  }
}

/**
 * 矩形 GPU：仅 sceneRenderer；失败返回 false。
 */
export function tryDrawRectsGpu(
  context: RenderContext,
  batches: ReadonlyArray<RectBatch>,
  scrollLeft: number,
): boolean {
  const active = batches.filter((b) => b.count > 0)
  if (active.length === 0) return true

  if (!context.sceneRenderer) return false
  if (drawRectBatchesViaRenderer(context.sceneRenderer, active, scrollLeft)) {
    compositeSceneRenderer(context)
    return true
  }
  return false
}
