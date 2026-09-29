/**
 * 模板持久化编解码：读取时校验并丢弃脏数据，写入时只保留模板字段。
 */

import type { PersistenceCodec } from '@/foundation/persistence/index.js'
import type { DrawingLabelPosition } from '@/foundation/plugin/index.js'

import type { DrawingTemplate, TemplateStyleKey } from '../types.js'
import { subsetTemplateStyle, TEMPLATE_STYLE_KEYS } from './templateMapping.js'

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/
const LABEL_POSITIONS: readonly DrawingLabelPosition[] = ['start', 'center', 'end']

const isColor = (value: unknown): boolean => typeof value === 'string' && COLOR_PATTERN.test(value)
const isStrokeWidth = (value: unknown): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
const isStrokeStyle = (value: unknown): boolean =>
  value === 'solid' || value === 'dashed' || value === 'dotted'
const STYLE_VALIDATORS: Record<TemplateStyleKey, (value: unknown) => boolean> = {
  stroke: isColor,
  fill: isColor,
  strokeWidth: isStrokeWidth,
  strokeStyle: isStrokeStyle,
}

/** 校验单个样式字段：颜色、正数线宽或合法线型，其余视为脏数据。 */
function isValidStyleEntry(key: string, value: unknown): boolean {
  return Object.hasOwn(STYLE_VALIDATORS, key)
    ? STYLE_VALIDATORS[key as TemplateStyleKey](value)
    : false
}

/** 校验一条记录是否是可用的模板。 */
function isDrawingTemplate(value: unknown): value is DrawingTemplate {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (typeof record.name !== 'string' || !record.name.trim()) return false
  if (!record.style || typeof record.style !== 'object' || Array.isArray(record.style)) return false
  if (
    record.labelPosition !== undefined &&
    !LABEL_POSITIONS.includes(record.labelPosition as DrawingLabelPosition)
  )
    return false
  const entries = Object.entries(record.style)
  return entries.length > 0 && entries.every(([key, value]) => isValidStyleEntry(key, value))
}

/** 写盘前拷贝成纯对象：IndexedDB 无法克隆 Vue proxy。 */
function toPlainTemplate(template: DrawingTemplate): DrawingTemplate {
  return {
    name: template.name,
    style: subsetTemplateStyle(template, TEMPLATE_STYLE_KEYS),
    ...(template.labelPosition === undefined ? {} : { labelPosition: template.labelPosition }),
  }
}

export const templateCodec: PersistenceCodec<DrawingTemplate[]> = {
  decode(value) {
    if (!Array.isArray(value)) return null
    return value.filter(isDrawingTemplate)
  },
  encode(value) {
    return value.map(toPlainTemplate)
  },
}
