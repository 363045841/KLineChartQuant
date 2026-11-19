/** 维护图元标签的命名目标和文本归一化规则。 */
import { fibLabelTarget, resolveFibLevels } from '../../geometry/impl/fibLevels.js'
import type { DrawingKind, DrawingLabel, DrawingLabels, DrawingLabelTarget } from '../../types.js'

const SINGLE_LINE = ['line'] as const
const CHANNEL = ['base', 'opposite', 'inside'] as const

const TARGETS = {
  'trend-line': SINGLE_LINE,
  ray: SINGLE_LINE,
  'extended-line': SINGLE_LINE,
  'fib-retracement': [],
  rectangle: ['top', 'right', 'bottom', 'left', 'inside'],
  label: [],
  arrow: SINGLE_LINE,
  'horizontal-line': SINGLE_LINE,
  'horizontal-ray': SINGLE_LINE,
  'vertical-line': SINGLE_LINE,
  'cross-line': ['horizontal', 'vertical'],
  'info-line': SINGLE_LINE,
  'parallel-channel': ['base', 'opposite', 'median', 'inside'],
  'regression-channel': ['median', 'upper', 'lower', 'inside'],
  'flat-line': CHANNEL,
  'disjoint-channel': CHANNEL,
} as const satisfies Record<DrawingKind, readonly DrawingLabelTarget[]>

/** 设置页和就地编辑默认选中的目标；未声明的类型取目标表第一项。 */
const DEFAULT_TARGET: Partial<Record<DrawingKind, DrawingLabelTarget>> = {
  rectangle: 'inside',
}

/** 按图元类型和已配置的回撤比例列出标签目标。 */
export function drawingLabelTargets(
  kind: DrawingKind,
  params: Record<string, unknown> = {},
): readonly DrawingLabelTarget[] {
  return kind === 'fib-retracement'
    ? [...new Set(resolveFibLevels(params).map(fibLabelTarget))]
    : TARGETS[kind]
}

/** 返回该图元默认展示的标签目标；没有可标注目标时返回 undefined。 */
export function defaultLabelTarget(
  kind: DrawingKind,
  params: Record<string, unknown> = {},
): DrawingLabelTarget | undefined {
  return DEFAULT_TARGET[kind] ?? drawingLabelTargets(kind, params)[0]
}

/** 验证单条标签并统一换行格式。 */
export function readDrawingLabel(value: unknown): DrawingLabel | undefined {
  if (typeof value !== 'object' || value === null || !('text' in value)) return undefined
  if (typeof value.text !== 'string' || !('position' in value)) return undefined
  const { text, position } = value
  if (position !== 'start' && position !== 'center' && position !== 'end') return undefined
  return { text: text.replace(/\r\n?|\n/g, '\\n'), position }
}

/** 只保留当前图元定义的命名目标。 */
export function normalizeDrawingLabels(
  kind: DrawingKind,
  labels: DrawingLabels | undefined,
  params?: Record<string, unknown>,
): DrawingLabels {
  const normalized: DrawingLabels = {}
  for (const target of drawingLabelTargets(kind, params)) {
    const label = readDrawingLabel(labels?.[target])
    if (label) normalized[target] = label
  }
  return normalized
}
