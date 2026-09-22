// 本文件负责将 Agent 的 Markdown 文本转换为可安全注入消息视图的 HTML。

import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'

import type { SourceCitation } from '../../agent-contracts.js'
import type { AgentMarkdownEnvironment } from '../types.js'
import { applyAgentCitationPlugin } from './agent-citation.js'

// 禁用原始 HTML，避免模型输出绕过 Markdown 语法直接插入标签。
const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
})

applyAgentCitationPlugin(markdown)

/** 将 Agent Markdown 与已验证来源解析并清洗为安全 HTML。 */
export function renderAgentMarkdown(
  content: string,
  citations: readonly SourceCitation[] = [],
): string {
  const citationNumbers = new Map(citations.map((citation, index) => [citation.id, index + 1]))
  return DOMPurify.sanitize(
    markdown.render(content, {
      citations: new Map(citations.map((citation) => [citation.id, citation])),
      citationNumbers,
    } satisfies AgentMarkdownEnvironment),
    { USE_PROFILES: { html: true } },
  )
}
