/** 绘图主层：只消费帧投影并绘制 primitive。 */
import type { RendererPlugin, RenderContext, DrawingPrimitive } from '../../foundation/plugin/index'

import {
  createDefaultPrimitiveRendererSet,
  type PrimitiveRendererSet,
} from '.'

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

/** 创建绘图 renderer；投影由 ChartRenderer 在 paint 前生成。 */
export function createDrawingRendererPlugin(options: {
  paneId?: string
  renderers?: PrimitiveRendererSet
}): RendererPlugin {
  const renderers = options.renderers ?? createDefaultPrimitiveRendererSet()

  return {
    name: 'drawingRenderer',
    version: '0.2.0',
    description: '绘图渲染器（消费当前帧投影）',
    debugName: '绘图层',
    paneId: options.paneId ?? 'main',
    priority: 55,
    draw(context: RenderContext) {
      const projection = context.drawingProjection
      if (!projection || projection.primitives.length === 0) return
      const viewport = context.viewport ?? {
        scrollLeft: context.scrollLeft,
        plotWidth: context.paneWidth,
        plotHeight: context.pane.height,
      }
      renderPrimitives(
        context.ctx,
        projection.primitives,
        renderers,
        { left: 0, top: 0, right: viewport.plotWidth, bottom: context.pane.height },
        context.dpr,
      )
    },
  }
}
