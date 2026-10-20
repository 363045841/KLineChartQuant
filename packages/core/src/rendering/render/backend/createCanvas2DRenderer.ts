/** Canvas 后端直接解释公共原语，不存在空壳 GPU 接口。 */
import { createCanvasPrimitiveBackend } from '../../primitives/impl/canvas.js'
import { createRenderer } from '../impl/createRenderer.js'

/** 创建 Canvas2D 原语后端。 */
export function createCanvas2DRenderer() {
  return createRenderer('canvas2d', createCanvasPrimitiveBackend())
}
