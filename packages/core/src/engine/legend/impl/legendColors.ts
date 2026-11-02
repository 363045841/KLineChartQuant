/**
 * 图例颜色投影：把主题色收窄成图例消费的四个语义槽。
 *
 * 主图上下文与副图标题共用同一份映射，避免各拼一次后新增字段只改到一边。
 */

import type { ColorTokens } from '@/foundation/tokens/index.js'
import type { LegendTemplateContext } from '../types.js'

/** 从主题色投影图例文本与涨跌颜色。 */
export function projectLegendColors(colors: ColorTokens): LegendTemplateContext['colors'] {
  return {
    textPrimary: colors.text.primary,
    textTertiary: colors.text.tertiary,
    up: colors.candleUpBody,
    down: colors.candleDownBody,
  }
}
