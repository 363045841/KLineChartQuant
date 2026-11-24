/**
 * 标签布局：锚点投影、重叠避让与内容边界夹紧。
 *
 * 只做几何决策，不接触画布；绘制与轴宽估算共用同一份文本解析与尺寸常量。
 * 避让只移动自由标签（role: 'tag'）：刻度保持原位置，最新价与十字线钉在真实锚点。
 */

import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import type { AxisColumn, AxisColumnProjection, AxisLabel } from '../types.js'
import {
  AXIS_LABEL_FONT_SIZE,
  AXIS_TIME_TAG_PADDING,
  axisTagHeight,
  TIME_AXIS_EDGE_PADDING,
} from './metrics.js'
import { measureAxisText } from './text.js'

/** 布局结果：色块宽度与绘制中心为列局部像素。 */
export interface PlacedAxisLabel {
  readonly label: AxisLabel
  readonly lines: readonly string[]
  readonly anchor: number
  /** 避让与夹紧后的绘制中心：Y 列为纵向中心，X 列为横向中心。 */
  readonly center: number
  /** 色块宽度：Y 列铺满列宽，X 列按文本估算；纯文字标签为 0。 */
  readonly width: number
}

/** 布局期间的草稿：center 与 width 可被避让与夹紧改写。 */
type Draft = {
  label: AxisLabel
  lines: readonly string[]
  anchor: number
  center: number
  width: number
}

/**
 * 解析标签的文本行：值标签按列投影格式化，时间标签使用来源给出的文本。
 *
 * @param label 标签数据
 * @param projection 所属列的投影
 * @returns 单行或多行文本
 */
export function resolveLabelLines(
  label: AxisLabel,
  projection: AxisColumnProjection,
): readonly string[] {
  if (label.kind === 'time') {
    if (projection.kind !== 'time')
      throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_STATE, '时间轴标签不能落到值轴列上')
    return [label.text]
  }
  if (projection.kind !== 'value')
    throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_STATE, '值轴标签不能落到时间轴列上')
  const text = projection.textFor(label.value, label.format)
  return label.note === undefined ? [text] : [text, label.note]
}

/** 锚点投影到列内像素；值标签走 yFor，时间标签走 xFor。 */
function projectAnchor(label: AxisLabel, projection: AxisColumnProjection): number {
  if (label.kind === 'time') {
    if (projection.kind !== 'time')
      throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_STATE, '时间轴标签不能落到值轴列上')
    return projection.xFor(label.index)
  }
  if (projection.kind !== 'value')
    throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_STATE, '值轴标签不能落到时间轴列上')
  return projection.yFor(label.value)
}

/**
 * 以列中线为界向外堆叠自由标签，保证相邻标签不重叠。
 *
 * @param items 自由标签（顺序会被按锚点重排）
 * @param extent 列在堆叠方向上的长度
 */
function avoidOverlap(items: Draft[], extent: number): void {
  if (items.length === 0) return
  const center = extent / 2
  const sorted = [...items].sort((a, b) => a.anchor - b.anchor)
  // 上半区从中线向上堆叠，下半区从中线向下堆叠。
  pack(sorted.filter((item) => item.anchor <= center).reverse(), -1, center, extent)
  pack(
    sorted.filter((item) => item.anchor > center),
    1,
    center,
    extent,
  )
}

/**
 * 单向堆叠：每条标签至少离中线方向的相邻标签一个标签高度。
 *
 * @param items 已按离中线由近到远排序的标签
 * @param direction 1 向下、-1 向上
 * @param center 列中线
 * @param extent 列长度
 */
function pack(items: Draft[], direction: 1 | -1, center: number, extent: number): void {
  let limit = center
  for (const item of items) {
    const half = axisTagHeight(item.lines.length) / 2
    const wanted =
      direction === 1 ? Math.max(item.anchor, limit + half) : Math.min(item.anchor, limit - half)
    item.center = direction === 1 ? Math.min(wanted, extent - half) : Math.max(wanted, half)
    limit = item.center + direction * half
  }
}

/**
 * 把钉住的标签夹在列内：marker 不参与避让，但整块必须落在可视区内。
 *
 * @param items 全部标签
 * @param extent 列长度
 */
function clampMarkers(items: Draft[], extent: number): void {
  for (const item of items) {
    if (item.label.role !== 'marker') continue
    const half = axisTagHeight(item.lines.length) / 2
    item.center = Math.min(Math.max(item.anchor, half), extent - half)
  }
}

/**
 * 计算时间轴标签的色块宽度并把中心夹在可视区内。
 *
 * @param items 非刻度标签
 * @param width 时间轴可视宽
 */
function clampTimeTags(items: Draft[], width: number): void {
  for (const item of items) {
    if (item.label.role === 'tick') continue
    const textWidth = Math.max(
      ...item.lines.map((line) => measureAxisText(line, AXIS_LABEL_FONT_SIZE)),
    )
    const boxWidth = Math.min(width, textWidth + AXIS_TIME_TAG_PADDING * 2)
    item.width = boxWidth
    item.center = Math.min(Math.max(item.anchor, boxWidth / 2), width - boxWidth / 2)
  }
}

/**
 * 布局一列标签。
 *
 * 超出可视区的锚点直接隐藏（不做边缘吸附）；时间轴刻度额外避开画布两端留白。
 *
 * @param labels 该列的全部标签
 * @param column 列几何与投影
 * @returns 按绘制顺序排列的标签（刻度、自由标签、钉住标签）
 */
export function layoutAxisLabels(
  labels: readonly AxisLabel[],
  column: AxisColumn,
): readonly PlacedAxisLabel[] {
  const { projection } = column
  const drafts: Draft[] = []
  for (const label of labels) {
    const anchor = projectAnchor(label, projection)
    if (!Number.isFinite(anchor)) continue
    if (projection.kind === 'time') {
      if (anchor < 0 || anchor > column.width) continue
      if (
        label.role === 'tick' &&
        (anchor < TIME_AXIS_EDGE_PADDING || anchor > column.width - TIME_AXIS_EDGE_PADDING)
      )
        continue
    } else if (anchor < 0 || anchor > column.height) continue
    drafts.push({
      label,
      lines: resolveLabelLines(label, projection),
      anchor,
      center: anchor,
      width: projection.kind === 'time' ? 0 : column.width,
    })
  }

  if (projection.kind === 'value') {
    avoidOverlap(
      drafts.filter((item) => item.label.role === 'tag'),
      column.height,
    )
    clampMarkers(drafts, column.height)
  } else {
    clampTimeTags(drafts, column.width)
  }

  const ticks = drafts
    .filter((item) => item.label.role === 'tick')
    .sort((a, b) => a.anchor - b.anchor)
  const tags = drafts
    .filter((item) => item.label.role === 'tag')
    .sort((a, b) => a.center - b.center)
  const markers = drafts.filter((item) => item.label.role === 'marker')
  return [...ticks, ...tags, ...markers]
}
