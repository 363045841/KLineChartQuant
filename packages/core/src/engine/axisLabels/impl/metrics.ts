/** 轴标签的尺寸与留白：布局、绘制与轴宽估算的唯一来源。 */

import { getFont } from '@/foundation/tokens/fonts.js'

/** 刻度与标签字号。 */
export const AXIS_LABEL_FONT_SIZE = 12

/** 带底色标签的纵向内边距（上下与行间共用）。 */
export const AXIS_TAG_PADDING = 2

/** 时间轴标签左右内边距。 */
export const AXIS_TIME_TAG_PADDING = 8

/** 轴宽估算为文字预留的横向留白。 */
export const AXIS_LABEL_SIDE_PADDING = 8

/** 时间轴刻度与画布边缘的最小留白，同时用于刻度选点和丢弃。 */
export const TIME_AXIS_EDGE_PADDING = 8

/**
 * 单条标签的绘制高度。
 *
 * @param lines 文本行数（值轴第二行是倒计时等附注）
 * @returns 逻辑像素高度
 */
export function axisTagHeight(lines: number): number {
  return lines * AXIS_LABEL_FONT_SIZE + (lines + 1) * AXIS_TAG_PADDING
}

/**
 * 标签文字字体。
 *
 * @param bold 是否加粗（时间轴年界刻度）
 */
export function axisLabelFont(bold = false): string {
  return getFont(AXIS_LABEL_FONT_SIZE, { bold })
}

/**
 * 单行文字在标签内的纵向偏移。
 *
 * @param line 行下标
 * @param lines 总行数
 * @returns 相对标签中心的偏移，逻辑像素
 */
export function axisLineOffset(line: number, lines: number): number {
  return (line - (lines - 1) / 2) * (AXIS_LABEL_FONT_SIZE + AXIS_TAG_PADDING)
}
