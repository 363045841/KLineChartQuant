/**
 * 手绘工具的绘制样式。
 *
 * 颜色和线宽只在工具入口决定一次；预览和最终提交共用这份样式，
 * 对象模型与渲染层不再补默认值。
 */
import type { DrawingStyle } from '@363045841yyt/klinechart-plot-contracts'
import { DEFAULT_DRAWING_STROKE } from '@/foundation/tokens/index.js'

/** 返回手绘工具的完整样式；预览按需改虚线，提交使用实线。 */
export function drawingToolStyle(): DrawingStyle {
  return { stroke: DEFAULT_DRAWING_STROKE, strokeWidth: 1, strokeStyle: 'solid' }
}
