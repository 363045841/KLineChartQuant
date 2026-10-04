/** 将可读绘制表面的原始物理像素复制为独立 Canvas。 */
import { GENERIC_ERROR_CODES, KLineChartError } from '../../../../errors.js'

/** 一比一复制 Canvas，不重新缩放或修改源画布。 */
export function copyCanvasFrame(source: HTMLCanvasElement): HTMLCanvasElement {
  const image = document.createElement('canvas')
  image.width = source.width
  image.height = source.height
  const context = image.getContext('2d')
  if (!context) {
    throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_STATE, '截图画布初始化失败')
  }
  context.drawImage(source, 0, 0)
  return image
}
