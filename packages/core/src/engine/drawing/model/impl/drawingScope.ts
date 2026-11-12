/** 同一标的跨周期共用图元；指标拥有的对象沿用宿主上下文。 */
import { ChartWorkspaceId } from '@/foundation/types/chartView.js'
import type { DrawingObject } from '../../types.js'
import type { DrawingScope } from '../types.js'
import { isDrawingVisibleInPeriod } from './drawingTimeframeVisibility.js'

/**
 * 统一标的归属判断。用户图元的身份只有 `symbolKey`：没有标的归属的用户图元
 * 只属于「尚未绑定标的」这一身份，不会出现在任何具体标的下；指标图元由宿主上下文决定归属。
 */
export function belongsToDrawingSymbol(
  drawing: DrawingObject,
  symbolKey: string | undefined,
): boolean {
  return drawing.symbolKey === undefined
    ? drawing.ownerId !== undefined || symbolKey === undefined
    : drawing.symbolKey === symbolKey
}

/**
 * 唯一可见性谓词：工作区、标的、Pane 与周期规则。
 *
 * `visible` 是文档级开关，交互还要额外排除指标图元，二者由各自的消费层处理，
 * 避免把「画不画」「点不点」混进同一个作用域判断。
 */
export function isDrawingInScope(
  drawing: DrawingObject,
  scope: DrawingScope & { readonly paneId?: string },
): boolean {
  if ((drawing.workspaceId ?? ChartWorkspaceId.KLine) !== scope.workspaceId) return false
  if (scope.paneId !== undefined && drawing.paneId !== scope.paneId) return false
  if (!belongsToDrawingSymbol(drawing, scope.symbolKey)) return false
  return isDrawingVisibleInPeriod(drawing.timeframeVisibility, scope.period)
}

/** 按作用域过滤图元；所有消费入口复用同一实现。 */
export function filterDrawingsInScope<T extends DrawingObject>(
  drawings: ReadonlyArray<T>,
  scope: DrawingScope & { readonly paneId?: string },
): T[] {
  return drawings.filter((drawing) => isDrawingInScope(drawing, scope))
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
