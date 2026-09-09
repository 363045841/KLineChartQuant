// 本文件负责将 Agent 的 Markdown 文本转换为可安全注入消息视图的 HTML。

import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'

import {
  AGENT_CITATION_MARKER_PREFIX,
  AGENT_CITATION_MARKER_SUFFIX,
  type SourceCitation,
} from './agent-contracts'

interface AgentMarkdownEnvironment {
  citations?: ReadonlyMap<string, SourceCitation>
  citationNumbers?: ReadonlyMap<string, number>
}

type CitationToken = {
  citation: SourceCitation
  number: number
}

// 禁用原始 HTML，避免模型输出绕过 Markdown 语法直接插入标签。
const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
})

markdown.inline.ruler.before('text', 'agent_citation', (state, silent) => {
  if (!state.src.startsWith(AGENT_CITATION_MARKER_PREFIX, state.pos)) return false
  const idStart = state.pos + AGENT_CITATION_MARKER_PREFIX.length
  const idEnd = state.src.indexOf(AGENT_CITATION_MARKER_SUFFIX, idStart)
  if (idEnd < 0) return false
  const environment = state.env as AgentMarkdownEnvironment
  const id = state.src.slice(idStart, idEnd)
  const citation = environment.citations?.get(id)
  if (!citation) return false
  if (!silent) {
    const token = state.push('agent_citation', 'button', 0)
    token.meta = {
      citation,
      number: environment.citationNumbers?.get(id) ?? 0,
    } satisfies CitationToken
  }
  state.pos = idEnd + AGENT_CITATION_MARKER_SUFFIX.length
  return true
})

markdown.renderer.rules.agent_citation = (tokens, index) => {
  const { citation, number } = tokens[index]!.meta as CitationToken
  const escape = markdown.utils.escapeHtml
  return `<button type="button" class="agent-citation" data-agent-citation-id="${escape(citation.id)}" title="${escape(citation.title)}" aria-label="Source ${escape(citation.title)}">[${number}]</button>`
}

/** 将 Agent Markdown 与已验证来源解析并清洗为安全 HTML。 */
export function renderAgentMarkdown(
  content: string,
  citations: readonly SourceCitation[] = [],
): string {
  const citationNumbers = new Map(citations.map((citation, index) => [citation.id, index + 1]))
  return DOMPurify.sanitize(markdown.render(content, {
    citations: new Map(citations.map((citation) => [citation.id, citation])),
    citationNumbers,
  } satisfies AgentMarkdownEnvironment), { USE_PROFILES: { html: true } })
}
