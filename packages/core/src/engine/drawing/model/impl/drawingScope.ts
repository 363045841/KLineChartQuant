/** 同一标的跨周期共用图元；指标拥有的对象沿用宿主上下文。 */
import type { DrawingObject } from '../../types.js'

/**
 * 统一标的可见性判断，文档查询、帧投影和交互列表共同使用。
 *
 * 用户图元的身份只有 `symbolKey`：没有标的归属的用户图元只属于「尚未绑定标的」
 * 这一身份，不会出现在任何具体标的下；导入边界会一次性补齐，而不是在这里
 * 回退成「所有标的可见」。指标图元由宿主上下文决定归属。
 */
export function belongsToDrawingSymbol(
  drawing: DrawingObject,
  symbolKey: string | undefined,
): boolean {
  return drawing.symbolKey === undefined
    ? drawing.ownerId !== undefined || symbolKey === undefined
    : drawing.symbolKey === symbolKey
}

/** 导入边界一次性为未归属的用户图元绑定标的；已归属对象和指标对象保留原身份。 */
export function bindDrawingSymbol(
  drawing: DrawingObject,
  symbolKey: string | undefined,
): DrawingObject {
  return drawing.ownerId === undefined && drawing.symbolKey === undefined && symbolKey !== undefined
    ? { ...drawing, symbolKey }
    : drawing
}
