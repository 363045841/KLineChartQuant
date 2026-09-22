// 引用标记插件：在 MarkdownIt 上注册 `[[cite:...]]` 的解析与按钮渲染规则。

import type { MarkdownIt } from 'markdown-it'

import {
  AGENT_CITATION_MARKER_PREFIX,
  AGENT_CITATION_MARKER_SUFFIX,
} from '../../agent-contracts.js'
import type { AgentCitationToken, AgentMarkdownEnvironment } from '../types.js'

/** 判断 Markdown token 的 meta 是否为本插件写入的引用数据。 */
function isAgentCitationToken(meta: unknown): meta is AgentCitationToken {
  return typeof meta === 'object' && meta !== null && 'citation' in meta && 'number' in meta
}

/** 在 MarkdownIt 实例上注册引用标记的 inline 解析规则与按钮渲染规则。 */
export function applyAgentCitationPlugin(markdown: MarkdownIt): void {
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
      } satisfies AgentCitationToken
    }
    state.pos = idEnd + AGENT_CITATION_MARKER_SUFFIX.length
    return true
  })

  markdown.renderer.rules.agent_citation = (tokens, index) => {
    const token = tokens[index]!
    if (!isAgentCitationToken(token.meta)) return ''
    const { citation, number } = token.meta
    const escapeHtml = markdown.utils.escapeHtml
    return `<button type="button" class="agent-citation" data-agent-citation-id="${escapeHtml(citation.id)}" title="${escapeHtml(citation.title)}" aria-label="Source ${escapeHtml(citation.title)}">[${number}]</button>`
  }
}
