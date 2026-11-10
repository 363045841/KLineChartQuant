/** 同一标的跨周期共用图元；没有标的归属的指标和独立图表图元沿用宿主上下文。 */
import type { DrawingObject } from '../../types.js'

/** 统一标的可见性判断，文档查询、帧投影和交互列表共同使用。 */
export function belongsToDrawingSymbol(
  drawing: DrawingObject,
  symbolKey: string | undefined,
): boolean {
  return drawing.symbolKey === undefined || drawing.symbolKey === symbolKey
}

/** 导入边界一次性为未归属的用户图元绑定标的；已归属对象和指标对象保留身份。 */
export function bindDrawingSymbol(
  drawing: DrawingObject,
  symbolKey: string | undefined,
): DrawingObject {
  return drawing.ownerId === undefined && drawing.symbolKey === undefined && symbolKey !== undefined
    ? { ...drawing, symbolKey }
    : drawing
}
