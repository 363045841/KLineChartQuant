// 本文件定义指标文本转义器的注册和匹配边界，统一所有 Agent 指标输出为字符串。

import type {
  IndicatorResultFormatter,
  IndicatorTextFormatContext,
  IndicatorTextFormatter,
} from '../../types.js'
import { formatIndicatorMarkdown } from './indicatorMarkdownFormatter.js'
import { BUILTIN_INDICATOR_FORMATTERS } from './indicatorSemanticFormatters.js'

/** 创建文本转义服务，扩展转义器优先于内置转义器。 */
export function createIndicatorTextFormatter(
  extensionFormatters: ReadonlyMap<string, IndicatorResultFormatter> = new Map(),
): IndicatorTextFormatter {
  const formatters = new Map(BUILTIN_INDICATOR_FORMATTERS)
  for (const [definitionId, formatter] of extensionFormatters) {
    formatters.set(definitionId, formatter)
  }
  return {
    /** 优先使用已注册的专用转义器，否则降级为通用 Markdown 表格。 */
    format(context: IndicatorTextFormatContext): string {
      return (formatters.get(context.definitionId) ?? formatIndicatorMarkdown)(context)
    },
  }
}
