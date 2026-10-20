/** 统一后端生命周期封装：所有绘图能力都由同一原语后端提供。 */
import type { PrimitiveBackend } from '@/rendering/primitives/types.js'
import type { Renderer, RendererName } from '../Renderer.js'

/** 构造完整后端，dispose 与原语资源使用同一所有权。 */
export function createRenderer(name: RendererName, primitives: PrimitiveBackend): Renderer {
  return { caps: { name }, primitives, dispose: () => primitives.dispose() }
}
