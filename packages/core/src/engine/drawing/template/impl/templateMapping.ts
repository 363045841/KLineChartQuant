/**
 * 绘图模板与图元之间的映射：可保存字段解析、模板抓取与应用。
 */

import { DEFAULT_DRAWING_STROKE } from '@/foundation/tokens/index.js'

import type { DrawingStyleKey } from '../../model/types.js'
import type { DrawingObject } from '../../types.js'
import type { DrawingTemplate, TemplateStyle, TemplateStyleKey } from '../types.js'

/** 模板可承载的全部样式字段。 */
export const TEMPLATE_STYLE_KEYS: readonly TemplateStyleKey[] = [
  'stroke',
  'fill',
  'strokeWidth',
  'strokeStyle',
]

/** 从 Core 确认的可编辑字段中筛出模板可保存的字段。 */
export function templateStyleFields(editable: ReadonlyArray<DrawingStyleKey>): TemplateStyleKey[] {
  return TEMPLATE_STYLE_KEYS.filter((key) => editable.includes(key))
}

/** 从图元抓取模板样式；颜色缺失时回退到线条色，保证模板始终可用。 */
export function captureTemplateStyle(
  drawing: DrawingObject,
  fields: ReadonlyArray<TemplateStyleKey>,
): TemplateStyle {
  const style: TemplateStyle = {}
  if (fields.includes('stroke')) style.stroke = drawing.style.stroke ?? DEFAULT_DRAWING_STROKE
  if (fields.includes('fill'))
    style.fill = drawing.style.fill ?? drawing.style.stroke ?? DEFAULT_DRAWING_STROKE
  if (fields.includes('strokeWidth') && drawing.style.strokeWidth !== undefined)
    style.strokeWidth = drawing.style.strokeWidth
  if (fields.includes('strokeStyle') && drawing.style.strokeStyle !== undefined)
    style.strokeStyle = drawing.style.strokeStyle
  return style
}

/** 从模板中取出允许写入的样式字段；模板缺字段时跳过。 */
export function subsetTemplateStyle(
  template: DrawingTemplate,
  fields: ReadonlyArray<TemplateStyleKey>,
): TemplateStyle {
  const style: TemplateStyle = {}
  if (fields.includes('stroke') && template.style.stroke !== undefined)
    style.stroke = template.style.stroke
  if (fields.includes('fill') && template.style.fill !== undefined) style.fill = template.style.fill
  if (fields.includes('strokeWidth') && template.style.strokeWidth !== undefined)
    style.strokeWidth = template.style.strokeWidth
  if (fields.includes('strokeStyle') && template.style.strokeStyle !== undefined)
    style.strokeStyle = template.style.strokeStyle
  return style
}

export function resolveTemplateStyle(
  template: DrawingTemplate,
  fields: ReadonlyArray<TemplateStyleKey>,
): TemplateStyle {
  return subsetTemplateStyle(template, fields)
}

export function resolveTemplateLabel(template: DrawingTemplate, drawing: DrawingObject) {
  const label = drawingTemplateLabel(drawing)
  return template.labelPosition && label
    ? { target: label.target, text: label.label.text, position: template.labelPosition }
    : null
}

/** 读取图元序号 0 的附属文本；模板只跟随已存在的文本位置。 */
export function drawingTemplateLabel(drawing: DrawingObject) {
  const line = drawing.labels?.line['0']
  if (line) return { target: 'line' as const, label: line }
  const area = drawing.labels?.area['0']
  if (area) return { target: 'area' as const, label: area }
  return null
}

/** 把图元抓取成一份命名模板。 */
export function captureDrawingTemplate(
  name: string,
  drawing: DrawingObject,
  fields: ReadonlyArray<TemplateStyleKey>,
): DrawingTemplate | null {
  const style = captureTemplateStyle(drawing, fields)
  if (Object.keys(style).length === 0) return null
  const label = drawingTemplateLabel(drawing)?.label
  return {
    name,
    style,
    ...(label ? { labelPosition: label.position } : {}),
  }
}
