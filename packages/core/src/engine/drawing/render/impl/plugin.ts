/** 绘图层：只消费帧投影并绘制 primitive。 */

import { makePluginLayerId } from '@/foundation/plugin/impl/rendererLayerId.js'
import type { DrawingPrimitive, RenderContext } from '@/foundation/plugin/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import { submitPrimitives } from '@/rendering/primitives/impl/paint.js'
import type { PaintPrimitive } from '@/rendering/primitives/types.js'
import type { Layer, LayerPaint, LayerRole, PrimitiveDrawContext } from '@/rendering/scene/types.js'
import type { RenderObject, RenderObjectDescriptor } from '@/rendering/scene/types.js'

import type { PrimitiveRendererSet } from '../types.js'
import { createDrawingPrimitiveBuilder } from './primitiveRendererSet.js'

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

/** 一层一次提交，保留 primitive 的原始顺序和该层独立的合成目标。 */
function paintProjection(
  context: LayerPaint<RenderContext>,
  primitives: ReadonlyArray<DrawingPrimitive>,
  custom: PrimitiveRendererSet,
): void {
  renderPrimitives(
    context.ctx,
    primitives,
    custom,
    { left: 0, top: 0, right: context.viewport.plotWidth, bottom: context.pane.height },
    context.dpr,
  )
}

/** 默认绘图只生成指令；所有目标选择、合成与后端分派都交给 Scene。 */
function submitProjection(
  context: PrimitiveDrawContext<RenderContext>,
  primitives: ReadonlyArray<DrawingPrimitive>,
): void {
  const builder = createDrawingPrimitiveBuilder(
    resolveThemeColors(context.theme, context.isAsiaMarket, context.colorPresetSettings)
      .chartBackground,
  )
  const commands: PaintPrimitive[] = []
  const clip = { left: 0, top: 0, right: context.viewport.plotWidth, bottom: context.pane.height }
  for (const primitive of primitives) {
    if (primitive.kind === 'point') commands.push(...builder.point(primitive, context.dpr))
    else if (primitive.kind === 'line') commands.push(...builder.line(primitive, clip, context.dpr))
    else if (primitive.kind === 'area') commands.push(...builder.area(primitive))
    else if (primitive.kind === 'arrow') commands.push(...builder.arrow(primitive, context.dpr))
    else commands.push(...builder.text(primitive))
  }
  submitPrimitives(context, commands, context.dpr)
}

type ProjectionKey = 'drawingProjection' | 'indicatorDrawingProjection' | 'sessionDrawingProjection'

/** Canvas 自定义扩展显式声明 context；默认实现始终使用无 ctx 的 draw-list。 */
function createProjectionLayer(
  id: string,
  role: LayerRole,
  z: number,
  key: ProjectionKey,
  options: DrawingLayerOptions,
): Layer<RenderContext> {
  const base = { id: makePluginLayerId(id), role, pane: 'global', z, visible: true, dispose() {} }
  const custom = options.renderers
  if (custom) {
    return {
      ...base,
      kind: 'context',
      paint(context) {
        const projection = context[key]
        if (projection) paintProjection(context, projection.primitives, custom)
      },
    }
  }
  return {
    ...base,
    kind: 'draw-list',
    paint(context) {
      const projection = context[key]
      if (projection) submitProjection(context, projection.primitives)
    },
  }
}

/** 绘图 Layer 选项。 */
export interface DrawingLayerOptions {
  paneId?: string
  renderers?: PrimitiveRendererSet
}

/** 绘图对象层的身份前缀；同步器与渲染器共用同一份命名。 */
const DRAWING_OBJECT_LAYER_PREFIX = 'drawingObject'

/**
 * 用户图元的对象层身份。
 *
 * @param drawingId 图元身份
 * @returns Scene 图层身份
 */
export function drawingObjectLayerId(drawingId: string): string {
  return makePluginLayerId(`${DRAWING_OBJECT_LAYER_PREFIX}:${drawingId}`)
}

/**
 * 每个用户图元一条渲染对象层，只提交本帧属于它的原语切片。
 *
 * @param drawingId 图元身份
 * @param paneId 图元所属 Pane
 * @param object 对象身份与命令
 * @returns 可挂载到 Scene 的渲染对象
 */
export function createDrawingObjectLayer(
  drawingId: string,
  paneId: string,
  object: RenderObjectDescriptor,
): RenderObject<RenderContext> {
  return {
    id: drawingObjectLayerId(drawingId),
    role: 'drawing',
    pane: paneId,
    z: 0,
    visible: true,
    object,
    kind: 'draw-list',
    paint(context) {
      const primitives = context.drawingObjectProjections?.get(drawingId)
      if (primitives) submitProjection(context, primitives)
    },
    dispose() {},
  }
}

/**
 * 正式图元的手柄/框选/磁吸层；几何已拆到每图元对象层。
 *
 * 投影由 ChartRenderer 在 paint 前生成。
 */
export function createDrawingOverlayLayer(
  options: DrawingLayerOptions = {},
): Layer<RenderContext> {
  return createProjectionLayer('drawingRenderer', 'drawing', 55, 'drawingProjection', options)
}

/**
 * 指标图元层：指标输出并入 main 目标，不再单独占用一张全尺寸 drawing 画布。
 * 用户手绘图元由每图元对象层写入 drawing 画布，二者在 Scene 内按层带排序。
 */
export function createIndicatorDrawingLayer(
  options: DrawingLayerOptions = {},
): Layer<RenderContext> {
  return createProjectionLayer(
    'indicatorDrawingRenderer',
    'indicator',
    54,
    'indicatorDrawingProjection',
    options,
  )
}

/** 会话图元单独绘制到动态覆盖层，每次移动只刷新临时坐标。 */
export function createDrawingSessionLayer(options: DrawingLayerOptions = {}): Layer<RenderContext> {
  return createProjectionLayer(
    'drawingSessionRenderer',
    'overlay',
    56,
    'sessionDrawingProjection',
    options,
  )
}
