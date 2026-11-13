/**
 * 图元种类声明表：每种 kind 的静态事实只在这里声明一次。
 *
 * 对象树、图例、工具栏、Agent schema、锚点物化、命中与轴标签投影都从这里取值；
 * 新增种类必须补一条，`Record<DrawingKind, ...>` 会在编译期强制穷尽。
 */

import type { DrawingKind, DrawingKindSpec, DrawingObject } from '../../types.js'

/** 无专属缺省参数的图元共用的冻结空对象。 */
export const EMPTY_DRAWING_PARAMS: Readonly<Record<string, unknown>> = Object.freeze({})

/**
 * 种类声明。
 *
 * 未声明的字段取安全缺省：非通道、两侧都投轴标签、不延伸、
 * 持久锚点数等于输入锚点数、无专属缺省参数。
 */
const DRAWING_KIND_SPECS: Readonly<Record<DrawingKind, DrawingKindSpec>> = {
  'trend-line': {
    label: '趋势线',
    inputAnchors: 2,
    agentExposed: true,
  },
  ray: {
    label: '射线',
    inputAnchors: 2,
    agentExposed: true,
    extend: 'right',
  },
  'extended-line': {
    label: '延长线',
    inputAnchors: 2,
    agentExposed: true,
    extend: 'both',
  },
  'fib-retracement': {
    label: '斐波那契回撤',
    inputAnchors: 2,
    agentExposed: true,
  },
  rectangle: {
    label: '矩形',
    inputAnchors: 2,
    persistedAnchors: 4,
    filled: true,
    agentExposed: true,
  },
  label: {
    label: '文本',
    inputAnchors: 1,
    agentExposed: false,
  },
  arrow: {
    label: '箭头',
    inputAnchors: 2,
    agentExposed: true,
  },
  'horizontal-line': {
    label: '水平线',
    inputAnchors: 1,
    axisLabels: 'price',
    agentExposed: true,
  },
  'horizontal-ray': {
    label: '水平射线',
    inputAnchors: 1,
    axisLabels: 'price',
    agentExposed: true,
  },
  'vertical-line': {
    label: '垂直线',
    inputAnchors: 1,
    axisLabels: 'time',
    agentExposed: true,
  },
  'cross-line': {
    label: '十字线',
    inputAnchors: 1,
    agentExposed: true,
  },
  'info-line': {
    label: '信息线',
    inputAnchors: 2,
    agentExposed: true,
  },
  'parallel-channel': {
    label: '平行通道',
    inputAnchors: 3,
    persistedAnchors: 4,
    filled: true,
    agentExposed: true,
  },
  'regression-channel': {
    label: '回归趋势',
    inputAnchors: 2,
    filled: true,
    agentExposed: true,
    defaultParams: Object.freeze({ sigma: 2 }),
  },
  'flat-line': {
    label: '平滑顶底',
    inputAnchors: 3,
    persistedAnchors: 4,
    filled: true,
    agentExposed: true,
  },
  'disjoint-channel': {
    label: '不相交通道',
    inputAnchors: 3,
    persistedAnchors: 4,
    filled: true,
    agentExposed: true,
  },
}

/** 全部种类，顺序即声明顺序；Agent 枚举与通道集合都由它派生。 */
export const DRAWING_KIND_VALUES: ReadonlyArray<DrawingKind> = Object.keys(
  DRAWING_KIND_SPECS,
) as DrawingKind[]

/** 取种类声明。 */
export function drawingKindSpec(kind: DrawingKind): DrawingKindSpec {
  return DRAWING_KIND_SPECS[kind]
}

/** 种类显示名。 */
export function drawingKindName(kind: DrawingKind): string {
  return DRAWING_KIND_SPECS[kind].label
}

/** 对象树与图例使用的标签：优先图元自身的文字，其次种类名。 */
export function resolveDrawingLabel(drawing: DrawingObject): string {
  const text = drawing.text?.value.trim()
  return text && text.length > 0 ? text : drawingKindName(drawing.kind)
}

/** 是否通道类：需要填充并参与内部命中。 */
export function isFilledDrawingKind(kind: DrawingKind): boolean {
  return DRAWING_KIND_SPECS[kind].filled === true
}

/** 通道类种类集合；由声明表派生。 */
export const CHANNEL_KINDS: ReadonlyArray<DrawingKind> =
  DRAWING_KIND_VALUES.filter(isFilledDrawingKind)

/** 锚点投影到哪些轴。 */
export function drawingKindAxisLabels(kind: DrawingKind): 'both' | 'price' | 'time' {
  return DRAWING_KIND_SPECS[kind].axisLabels ?? 'both'
}

/** 线段缺省延伸方向。 */
export function drawingKindExtend(kind: DrawingKind): 'none' | 'left' | 'right' | 'both' {
  return DRAWING_KIND_SPECS[kind].extend ?? 'none'
}

/** 创建时写入的缺省参数。 */
export function drawingKindDefaultParams(kind: DrawingKind): Readonly<Record<string, unknown>> {
  return DRAWING_KIND_SPECS[kind].defaultParams ?? EMPTY_DRAWING_PARAMS
}

/** Agent `drawing_create` 开放的种类。 */
export const AGENT_DRAWING_KINDS: ReadonlyArray<DrawingKind> = DRAWING_KIND_VALUES.filter(
  (kind) => DRAWING_KIND_SPECS[kind].agentExposed,
)
