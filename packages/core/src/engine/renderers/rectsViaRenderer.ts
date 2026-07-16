import type { RenderContext } from '../../foundation/plugin/index'
import type { Renderer } from '../../rendering/render/Renderer'
import { compositeSceneRenderer } from './linesViaRenderer'

export type RectBatch = {
  buf: Float32Array
  count: number
  color: string
}

/**
 * 经 Renderer.drawInstances 画多组矩形（volume / MACD bar / candle 共用）。
 * 任一非空 batch 失败 → false。不负责 composite。
 */
export function drawRectBatchesViaRenderer(
  renderer: Renderer,
  batches: ReadonlyArray<RectBatch>,
  scrollLeft: number,
): boolean {
  if (!renderer.surface.isAvailable()) return false

  let pipeline: ReturnType<Renderer['createPipeline']> | null = null
  let unit: ReturnType<Renderer['createBuffer']> | null = null

  try {
    pipeline = renderer.createPipeline({ type: 'candle' })
    unit = renderer.createBuffer('vertex', 64)

    for (const batch of batches) {
      if (batch.count <= 0) continue
      const instances = renderer.createBuffer('instance', batch.count * 4 * 4)
      try {
        renderer.writeBuffer(instances, batch.buf.subarray(0, batch.count * 4))
        const ok = renderer.drawInstances({
          pipeline,
          vertices: unit,
          instances,
          instanceCount: batch.count,
          vertexCount: 6,
          uniforms: { color: batch.color, scrollLeft },
        })
        if (!ok) return false
      } finally {
        renderer.destroyBuffer(instances)
      }
    }
    return true
  } catch {
    return false
  } finally {
    if (unit) renderer.destroyBuffer(unit)
    if (pipeline) renderer.destroyPipeline(pipeline)
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
