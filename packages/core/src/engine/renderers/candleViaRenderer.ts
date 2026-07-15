import type { Renderer } from '../../rendering/render/Renderer'
import { drawRectBatchesViaRenderer } from './rectsViaRenderer'

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
  return drawRectBatchesViaRenderer(
    renderer,
    [
      { buf: prepared.upBodyBuf, count: prepared.upBodyCount, color: upColor },
      { buf: prepared.downBodyBuf, count: prepared.downBodyCount, color: downColor },
      { buf: prepared.upWickBuf, count: prepared.upWickCount, color: upColor },
      { buf: prepared.downWickBuf, count: prepared.downWickCount, color: downColor },
    ],
    scrollLeft,
  )
}
