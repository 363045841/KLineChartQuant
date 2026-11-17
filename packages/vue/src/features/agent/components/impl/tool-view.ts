// 工具结果展示字段：从官方 details 读取宿主写入的展示元数据，不做结构转换。
import type { AgentErrorView, EvidenceView, JsonValue } from '../../agent-contracts.js'

/** 工具展示元数据，与工具扩展写入 details 的形状一致。 */
export interface ToolPresentation {
  readonly label?: string
  readonly inputSummary?: string
  readonly summary?: string
  readonly evidence?: EvidenceView
  readonly failure?: AgentErrorView
}

/** 判断 JSON 对象。 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 读取可选字符串字段。 */
function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/** 读取证据字段。 */
function evidence(value: unknown): EvidenceView | undefined {
  if (!isObject(value)) return undefined
  const view: EvidenceView = {}
  if (text(value.symbol)) view.symbol = text(value.symbol)
  if (text(value.period)) view.period = text(value.period)
  if (text(value.source)) view.source = text(value.source)
  if (text(value.timezone)) view.timezone = text(value.timezone)
  if (text(value.range)) view.range = text(value.range)
  if (typeof value.returned === 'number') view.returned = value.returned
  return Object.keys(view).length > 0 ? view : undefined
}

/** 读取工具失败字段。 */
function failure(value: unknown): AgentErrorView | undefined {
  if (!isObject(value)) return undefined
  const code = text(value.code)
  const message = text(value.message)
  if (!code || !message) return undefined
  return {
    code,
    message,
    retryable: value.retryable === true,
    ...(text(value.providerCode) ? { providerCode: text(value.providerCode) } : {}),
    ...(text(value.raw) ? { raw: text(value.raw) } : {}),
    ...(text(value.recommendedAction) ? { recommendedAction: text(value.recommendedAction) } : {}),
  }
}

/** 把官方 details 中的展示字段收窄成 UI 视图。 */
export function readToolPresentation(details: JsonValue | undefined): ToolPresentation {
  if (!isObject(details)) return {}
  return {
    ...(text(details.label) ? { label: text(details.label) } : {}),
    ...(text(details.inputSummary) ? { inputSummary: text(details.inputSummary) } : {}),
    ...(text(details.summary) ? { summary: text(details.summary) } : {}),
    ...(evidence(details.evidence) ? { evidence: evidence(details.evidence) } : {}),
    ...(failure(details.failure) ? { failure: failure(details.failure) } : {}),
  }
}

/** 拼接工具结果正文中的文本块。 */
export function readResultText(content: readonly { type: string; text?: string }[]): string {
  return content
    .flatMap((block) => (block.type === 'text' && block.text ? [block.text] : []))
    .join('')
}

/** 从工具结果 details 中读取可引用的来源。 */
export function readCitations(
  details: JsonValue | undefined,
): readonly import('../../agent-contracts.js').SourceCitation[] {
  if (!isObject(details) || !Array.isArray(details.citations)) return []
  return details.citations.flatMap((item) => {
    if (!isObject(item)) return []
    const id = text(item.id)
    const title = text(item.title)
    const url = text(item.url)
    const snippet = text(item.snippet)
    if (!id || !title || !url || snippet === undefined) return []
    return [
      {
        id,
        title,
        url,
        snippet,
        ...(text(item.publishedAt) ? { publishedAt: text(item.publishedAt) } : {}),
      },
    ]
  })
}
