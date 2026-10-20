/** 渲染后端只有统一原语能力；可见画布、层序与截图归 Scene 合成结果所有。 */
import type { PrimitiveBackend } from '../primitives/types.js'

export type RendererName = 'canvas2d' | 'webgl2' | 'webgpu'
export interface RendererCapabilities {
  readonly name: RendererName
}

/** 后端不暴露独立可见 surface 或第二套 buffer/pipeline 绘制接口。 */
export interface Renderer {
  readonly caps: RendererCapabilities
  readonly primitives: PrimitiveBackend
  dispose(): void
}
