/**
 * 图例行唯一构造入口：主图、副图与自定义行共用行几何和文本间距解析。
 */

import { PANE_HEADER_INSET_PX } from '@/engine/pane/types.js'
import type { LegendActionButton, LegendRow, LegendText } from '../types.js'
import {
  LEGEND_GAP_PX,
  LEGEND_ROW_HEIGHT_PX,
  legendRowTop,
  resolveLegendRowTexts,
} from './legendGeometry.js'

/** 行几何：左右内边距、行盒高度与文本默认间距。 */
export interface LegendRowLayout {
  inset: number
  height: number
  gap: number
}

/** 主图以外的行以及未显式传布局的行使用的默认几何。 */
export const DEFAULT_LEGEND_ROW_LAYOUT: LegendRowLayout = {
  inset: PANE_HEADER_INSET_PX,
  height: LEGEND_ROW_HEIGHT_PX,
  gap: LEGEND_GAP_PX,
}

/** 行在所属 Pane 内的位置；index 决定行盒顶部。 */
export interface LegendRowPlacement {
  paneId: string
  paneTop: number
  paneWidth: number
  index: number
}

/** 行内容：文本、按钮与领域身份。 */
export interface LegendRowContent {
  key: string
  texts: ReadonlyArray<LegendText>
  actions?: ReadonlyArray<LegendActionButton>
  indicator?: LegendRow['indicator']
  comparison?: LegendRow['comparison']
  hidden?: boolean
  loading?: boolean
  error?: string
}

/**
 * 创建一个图例行。
 *
 * 行几何与文本间距只在这里换算，调用方只提供 Pane、序号和内容，
 * 避免主图、副图、自定义行各拼一遍坐标。
 */
export function createLegendRow(
  placement: LegendRowPlacement,
  content: LegendRowContent,
  layout: LegendRowLayout = DEFAULT_LEGEND_ROW_LAYOUT,
): LegendRow {
  const { inset, height, gap } = layout
  return {
    key: content.key,
    paneId: placement.paneId,
    x: inset,
    y: legendRowTop(placement.paneTop, placement.index),
    maxWidth: Math.max(0, placement.paneWidth - inset),
    height,
    texts: resolveLegendRowTexts(content.texts, gap),
    actions: content.actions ?? [],
    ...(content.indicator === undefined ? {} : { indicator: content.indicator }),
    ...(content.comparison === undefined ? {} : { comparison: content.comparison }),
    ...(content.hidden === undefined ? {} : { hidden: content.hidden }),
    ...(content.loading === undefined ? {} : { loading: content.loading }),
    ...(content.error === undefined ? {} : { error: content.error }),
  }
}

/** 汇总后的窗格标题内容只在此分配连续行号，内容投影不能自行定位。 */
export function layoutLegendRows(
  placement: Omit<LegendRowPlacement, 'index'>,
  contents: ReadonlyArray<LegendRowContent>,
  layout: LegendRowLayout = DEFAULT_LEGEND_ROW_LAYOUT,
): LegendRow[] {
  return contents.map((content, index) => createLegendRow({ ...placement, index }, content, layout))
}
