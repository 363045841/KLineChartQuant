// 绘图标签契约的唯一事实来源：键为渲染输出的线段 / 区域序号，值经形状校验后归一化。
import type { DrawingLabel, DrawingLabelIndex, DrawingLabels } from '../../types.js'

/** 标签键正则：规范的非负整数字符串，与渲染输出的序号一一对应（无符号、无小数、无前导零）。 */
export const DRAWING_LABEL_INDEX_PATTERN = '^(0|[1-9]\\d*)$'

const DRAWING_LABEL_INDEX_REGEXP = new RegExp(DRAWING_LABEL_INDEX_PATTERN)

/** 判断键是否为合法的渲染序号。 */
export function isDrawingLabelIndexKey(key: string): key is DrawingLabelIndex {
  return DRAWING_LABEL_INDEX_REGEXP.test(key)
}

/** 由渲染序号构造合法的标签键。 */
export function drawingLabelIndexKey(index: number): DrawingLabelIndex {
  return `${index}`
}

/** 统一换行为字面量换行控制码。 */
function normalizeLabelText(text: string): string {
  return text.replace(/\r\n?|\n/g, '\\n')
}

/** 判断值是否为形状完整的标签对象；用于丢弃外部数据里的畸形条目。 */
function isWellFormedLabel(value: unknown): value is DrawingLabel {
  if (typeof value !== 'object' || value === null) return false
  if (!('text' in value) || typeof value.text !== 'string') return false
  if (!('position' in value)) return false
  return value.position === 'start' || value.position === 'center' || value.position === 'end'
}

/**
 * 按渲染序号键归一化一组标签。
 * 序号以外的键与畸形值一律丢弃：渲染端本就按序号查找、取不到，丢弃是唯一有意义的解释。
 */
function normalizeLabelGroup(group: unknown): DrawingLabels['line'] {
  if (typeof group !== 'object' || group === null) return {}
  const normalized: DrawingLabels['line'] = {}
  for (const [key, value] of Object.entries(group)) {
    if (!isDrawingLabelIndexKey(key) || !isWellFormedLabel(value)) continue
    normalized[key] = { text: normalizeLabelText(value.text), position: value.position }
  }
  return normalized
}

/** 将外部标签统一为按渲染序号键、字面量换行的文档模型；非法键与畸形值被丢弃。 */
export function normalizeDrawingLabels(labels: unknown): DrawingLabels {
  if (typeof labels !== 'object' || labels === null) return { line: {}, area: {} }
  const line = 'line' in labels ? labels.line : undefined
  const area = 'area' in labels ? labels.area : undefined
  return { line: normalizeLabelGroup(line), area: normalizeLabelGroup(area) }
}
