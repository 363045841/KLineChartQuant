/**
 * Layer 业务绘制契约的实例化。
 *
 * `DrawContext<TFrame, TSceneRenderer>` 是框架无关的 Layer 绘制契约；图表业务
 * 把 `TFrame` 实例化为 `RenderContext`、`TSceneRenderer` 实例化为真实 `Renderer`，
 * 得到 `LayerDrawContext`；渲染器只依赖这个别名。
 */

import type { Renderer } from '@/rendering/render/Renderer.js'

import type { DrawContext, RenderContext } from '../types.js'

/** 图表业务实例化后的 Layer 绘制上下文：RenderContext + sceneRenderer。 */
export type LayerDrawContext = DrawContext<RenderContext, Renderer>
