/**
 * 图例几何唯一来源：行盒高度、间距与紧凑阈值。
 *
 * DOM 行位置与副图标题堆叠都从这里取，图例不参与价格坐标或内容区裁剪。
 */

import { PANE_HEADER_INSET_PX } from '@/engine/pane/types.js'
import { LEGEND_TEXT_LINE_HEIGHT, type LegendRowText, type LegendText } from '../types.js'

/** 图例行盒高度；主图与副图共用。 */
export const LEGEND_ROW_HEIGHT_PX = 24
/** 同一行内文本片段之间的默认横向间距。 */
export const LEGEND_GAP_PX = 10
/** 同一组读数内部（涨跌额与涨跌幅）的间距。 */
export const LEGEND_READOUT_GAP_PX = LEGEND_GAP_PX / 4
/** 指标名称与参数之间的间距。 */
export const LEGEND_PARAM_GAP_PX = 4
/** 窄于该宽度时行情行拆成两行。 */
export const LEGEND_COMPACT_WIDTH_PX = 400
/** 收起控件的显示高度，不参与 Pane 布局。 */
export const LEGEND_COLLAPSE_HEIGHT_PX = 16

/**
 * 文本行高小于行盒时的半行距。
 * 文本在行盒内垂直居中，行盒顶部必须上移同样的距离，文本的上、左内边距才一致。
 */
export const LEGEND_ROW_TEXT_OFFSET_PX = (LEGEND_ROW_HEIGHT_PX - LEGEND_TEXT_LINE_HEIGHT) / 2

/**
 * 为一段行文本解析最终间距：首段为 0，其余用显式 gapBefore 或行默认间距。
 *
 * renderer 只消费结果并写 margin-left，不再按段落位置决定容器间距。
 */
export function resolveLegendRowTexts(
  texts: ReadonlyArray<LegendText>,
  gap: number,
): LegendRowText[] {
  return texts.map((text, index) => ({
    ...text,
    gapBefore: index === 0 ? 0 : (text.gapBefore ?? gap),
  }))
}

/**
 * 第 index 行的行盒顶部。
 * 文本顶部落在 paneTop + 内边距，与左侧内边距对齐。
 */
export function legendRowTop(paneTop: number, index: number): number {
  return paneTop + PANE_HEADER_INSET_PX - LEGEND_ROW_TEXT_OFFSET_PX + index * LEGEND_ROW_HEIGHT_PX
}
