import type { Renderer } from '../../rendering/render/Renderer'

/** 与 prepareCandles 输出对齐的矩形 batch（仅 GPU 路径所需字段） */
export type CandleRectBatch = {
  upBodyCount: number
  downBodyCount: number
  upWickCount: number
  downWickCount: number
  upBodyBuf: Float32Array
  downBodyBuf: Float32Array
  upWickBuf: Float32Array
  downWickBuf: Float32Array
}

/**
 * 经 Renderer.drawInstances 画 body/wick。
 * 任一非空 batch 绘制失败 → false（调用方应走 2D）。
 * 不负责 composite。
 */
export function drawCandlesViaRenderer(
  renderer: Renderer,
  prepared: CandleRectBatch,
  upColor: string,
  downColor: string,
  scrollLeft: number,
): boolean {
  if (!renderer.surface.isAvailable()) return false

  let pipeline: ReturnType<Renderer['createPipeline']> | null = null
  let unit: ReturnType<Renderer['createBuffer']> | null = null

  try {
    pipeline = renderer.createPipeline({ type: 'candle' })
    unit = renderer.createBuffer('vertex', 64)

    const drawBatch = (buf: Float32Array, count: number, color: string): boolean => {
      if (count <= 0) return true
      const instances = renderer.createBuffer('instance', count * 4 * 4)
      try {
        renderer.writeBuffer(instances, buf.subarray(0, count * 4))
        return renderer.drawInstances({
          pipeline: pipeline!,
          vertices: unit!,
          instances,
          instanceCount: count,
          vertexCount: 6,
          uniforms: { color, scrollLeft },
        })
      } finally {
        renderer.destroyBuffer(instances)
      }
    }

    if (!drawBatch(prepared.upBodyBuf, prepared.upBodyCount, upColor)) return false
    if (!drawBatch(prepared.downBodyBuf, prepared.downBodyCount, downColor)) return false
    if (!drawBatch(prepared.upWickBuf, prepared.upWickCount, upColor)) return false
    if (!drawBatch(prepared.downWickBuf, prepared.downWickCount, downColor)) return false
    return true
  } catch {
    return false
  } finally {
    if (unit) renderer.destroyBuffer(unit)
    if (pipeline) renderer.destroyPipeline(pipeline)
  }
}
