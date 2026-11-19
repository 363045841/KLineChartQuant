/**
 * 布局读取边界的标签兼容层：把旧布局的数字索引转换成命名目标。
 *
 * 旧顺序冻结在下面的表里，禁止跟随当前渲染器调整，否则会静默改写旧数据。
 */
import {
  DRAWING_KIND_VALUES,
  type DrawingKind,
  type DrawingLabels,
  type DrawingLabelTarget,
  type DrawingObject,
  drawingLabelTargets,
  readDrawingLabel,
} from '../../drawing/index.js'
import type { LayoutDocument } from '../types.js'

/** 旧版本逐条线输出的顺序（只计 line/arrow 图元，不含填充区域）。 */
const LEGACY_COMPOSITE_LINE_ORDER: Partial<Record<DrawingKind, readonly DrawingLabelTarget[]>> = {
  'cross-line': ['horizontal', 'vertical'],
  'parallel-channel': ['base', 'opposite', 'median'],
  'regression-channel': ['median', 'upper', 'lower'],
  'flat-line': ['base', 'opposite'],
  'disjoint-channel': ['base', 'opposite'],
}

/** 旧版本矩形的四条边，按上、右、下、左绘制。 */
const LEGACY_RECTANGLE_EDGES = ['top', 'right', 'bottom', 'left'] as const

/** 只接受普通记录形状。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 识别旧数字组；新格式的 line 对象含 text 和 position，键不全为数字。 */
function indexedLabels(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) && Object.keys(value).every((key) => /^(0|[1-9]\d*)$/.test(key))
    ? value
    : undefined
}

/** 按旧几何的输出顺序解释索引，延伸时跳过原本省略的边。 */
function legacyLineTargets(drawing: DrawingObject): readonly DrawingLabelTarget[] {
  if (drawing.kind === 'fib-retracement')
    return drawingLabelTargets('fib-retracement', drawing.params)
  if (drawing.kind !== 'rectangle') {
    const composite = LEGACY_COMPOSITE_LINE_ORDER[drawing.kind]
    if (composite) return composite
    return drawingLabelTargets(drawing.kind).includes('line') ? ['line'] : []
  }
  if (drawing.style?.strokeWidth === 0) return []
  const { extend } = drawing
  return LEGACY_RECTANGLE_EDGES.filter((target) => {
    if (target === 'right') return extend !== 'right' && extend !== 'both'
    if (target === 'left') return extend !== 'left' && extend !== 'both'
    return true
  })
}

/** 转换单个图元；同一图元里已命名的标签优先，未知类型原样保留。 */
function migrateDrawing(drawing: DrawingObject): DrawingObject {
  if (!DRAWING_KIND_VALUES.includes(drawing.kind)) return drawing
  const stored: unknown = drawing.labels
  if (!isRecord(stored)) return drawing
  const lines = indexedLabels(stored.line)
  const areas = indexedLabels(stored.area)
  if (!lines && !areas) return drawing

  const labels: DrawingLabels = {}
  const targets = drawingLabelTargets(drawing.kind, drawing.params)
  for (const target of targets) {
    const label = readDrawingLabel(stored[target])
    if (label) labels[target] = label
  }
  legacyLineTargets(drawing).forEach((target, index) => {
    const label = readDrawingLabel(lines?.[index])
    if (label && !labels[target]) labels[target] = label
  })
  const area = readDrawingLabel(areas?.['0'])
  if (area && targets.includes('inside')) labels.inside ??= area
  return { ...drawing, labels }
}

/** 在工作区布局边界迁移标签，导入与归档读取共用。 */
export function migrateLayoutDrawingLabels<T extends LayoutDocument>(document: T): T {
  const original = document.drawings
  if (!Array.isArray(original)) return document
  const drawings = original.map(migrateDrawing)
  return drawings.some((drawing, index) => drawing !== original[index])
    ? { ...document, drawings }
    : document
}
