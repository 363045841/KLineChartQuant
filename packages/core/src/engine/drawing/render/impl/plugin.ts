/** 绘图层：只消费帧投影并绘制 primitive。 */

import { makePluginLayerId } from '@/foundation/plugin/impl/rendererLayerId.js'
import type { DrawingPrimitive, RenderContext } from '@/foundation/plugin/index.js'
import type { Layer } from '@/rendering/scene/types.js'

import type { PrimitiveRendererSet } from '../types.js'
import { createDefaultPrimitiveRendererSet } from './primitiveRendererSet.js'

/** 将已投影 primitive 绘制到当前 Pane。 */
function renderPrimitives(
  ctx: CanvasRenderingContext2D,
  primitives: ReadonlyArray<DrawingPrimitive>,
  renderers: PrimitiveRendererSet,
  viewportClip: { left: number; top: number; right: number; bottom: number },
  dpr: number,
): void {
  for (const primitive of primitives) {
    if (primitive.kind === 'point') renderers.point(ctx, primitive, dpr)
    else if (primitive.kind === 'line') renderers.line(ctx, primitive, viewportClip, dpr)
    else if (primitive.kind === 'area') renderers.area(ctx, primitive, dpr)
    else if (primitive.kind === 'arrow') renderers.arrow(ctx, primitive, dpr)
    else renderers.text(ctx, primitive, dpr)
  }
}

/** 绘图 Layer 选项。 */
export interface DrawingLayerOptions {
  paneId?: string
  renderers?: PrimitiveRendererSet
}

/**
 * 创建绘图 Layer；投影由 ChartRenderer 在 paint 前生成。
 * 正式图元输出到独立 canvas，保持在所有行情图元之上。
 */
export function createDrawingLayer(options: DrawingLayerOptions = {}): Layer<RenderContext> {
  const renderers = options.renderers ?? createDefaultPrimitiveRendererSet()

  return {
    id: makePluginLayerId('drawingRenderer'),
    role: 'drawing',
    pane: 'global',
    z: 55,
    visible: true,
    paint(context) {
      const projection = context.drawingProjection
      if (!projection || projection.primitives.length === 0 || !context.drawingCtx) return
      const viewport = context.viewport
      renderPrimitives(
        // 正式图元表面独立于行情和会话，动态清屏不会擦掉这里的像素。
        context.drawingCtx,
        projection.primitives,
        renderers,
        { left: 0, top: 0, right: viewport.plotWidth, bottom: context.pane.height },
        context.dpr,
      )
    },
    dispose() {},
  }
}

/** 会话图元单独绘制到动态覆盖层，每次移动只刷新临时坐标。 */
export function createDrawingSessionLayer(options: DrawingLayerOptions = {}): Layer<RenderContext> {
  const renderers = options.renderers ?? createDefaultPrimitiveRendererSet()
  return {
    id: makePluginLayerId('drawingSessionRenderer'),
    role: 'overlay',
    pane: 'global',
    z: 56,
    visible: true,
    paint(context) {
      const projection = context.sessionDrawingProjection
      if (!projection || projection.primitives.length === 0) return
      renderPrimitives(
        context.overlayCtx ?? context.ctx,
        projection.primitives,
        renderers,
        { left: 0, top: 0, right: context.viewport.plotWidth, bottom: context.pane.height },
        context.dpr,
      )
    },
    dispose() {},
  }
}
