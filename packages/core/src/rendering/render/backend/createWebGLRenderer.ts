/** WebGL 后端只持有离屏原语设备，像素按 Scene 顺序写入指定目标。 */
import { createWebGLPrimitiveBackend } from '../../primitives/impl/webgl.js'
import { createRenderer } from '../impl/createRenderer.js'

/** 初始化时验证实际设备；失败交给 RendererHost 选择后端。 */
export function createWebGLRenderer() {
  return createRenderer('webgl2', createWebGLPrimitiveBackend())
}
