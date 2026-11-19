// 本文件将网络搜索供应商适配为 Pi Agent 可调用的只读工具。
import { type Static, Type } from 'typebox'

import { AgentRuntimeError } from '../../contracts/errors.js'
import type { RuntimeToolDefinition } from '../../pi/types.js'
import { toolFailureResult } from '../../tools/failure.js'
import { DEFAULT_WEB_SEARCH_LIMIT } from '../types.js'
import type { WebSearchProvider } from '../types.js'
import { formatWebSearchResult } from './web-search-formatter.js'

export const WEB_SEARCH_TOOL_NAME = 'web_search'
export const WEB_SEARCH_TOOL_METADATA = {
  name: WEB_SEARCH_TOOL_NAME,
  label: 'Web search',
  description:
    'Search the public web for current information. Results include titles, URLs, and snippets; cite the returned URLs when using them.',
} as const

const WEB_SEARCH_MAX_LIMIT = 10

const WebSearchParameters = Type.Object({
  query: Type.String({ minLength: 1, maxLength: 500 }),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: WEB_SEARCH_MAX_LIMIT })),
})

type WebSearchInput = Static<typeof WebSearchParameters>

/**
 * 创建标准只读网络搜索工具。
 *
 * 供应商必填：免费额度与自有 Key 都由供应商内部决定，工具本身不处理配置状态。
 * 已知错误按 `AgentErrorView` 返回给模型；未知异常直接上抛，不伪装成搜索结果。
 *
 * @param provider 已由宿主选好通道的网络搜索供应商。
 * @returns 只读、可并行的运行时工具定义。
 */
export function createWebSearchTool(provider: WebSearchProvider): RuntimeToolDefinition {
  return {
    ...WEB_SEARCH_TOOL_METADATA,
    parameters: WebSearchParameters,
    effect: 'read',
    executionMode: 'parallel',
    summarizeInput: (input) => (input as WebSearchInput).query,
    async execute(input, context) {
      const request = input as WebSearchInput
      context.signal.throwIfAborted()
      context.progress({ label: 'Searching the web' })
      try {
        const sources = await provider.search(
          { query: request.query, limit: request.limit ?? DEFAULT_WEB_SEARCH_LIMIT },
          { signal: context.signal },
        )
        context.signal.throwIfAborted()
        const result = formatWebSearchResult(sources, context.toolCallId)
        return {
          content: result.content,
          citations: result.citations,
          summary: sources.length
            ? `Found ${sources.length} web results.`
            : 'No web results found.',
        }
      } catch (error) {
        context.signal.throwIfAborted()
        if (!(error instanceof AgentRuntimeError)) throw error
        return toolFailureResult(error.toView())
      }
    },
  }
}
