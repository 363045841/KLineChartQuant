// 本文件将网络搜索供应商适配为 Pi Agent 可调用的只读工具。
import { Type, type Static } from 'typebox'

import type { RuntimeToolDefinition } from '../pi/types.js'
import { formatWebSearchResult } from './web-search-formatter.js'
import type { WebSearchProvider } from './types.js'

export const WEB_SEARCH_TOOL_NAME = 'web_search'
export const WEB_SEARCH_TOOL_METADATA = {
  name: WEB_SEARCH_TOOL_NAME,
  label: 'Web search',
  description:
    'Search the public web for current information. Results include titles, URLs, and snippets; cite the returned URLs when using them.',
} as const

const WEB_SEARCH_DEFAULT_LIMIT = 5
const WEB_SEARCH_MAX_LIMIT = 10

const WebSearchParameters = Type.Object({
  query: Type.String({ minLength: 1, maxLength: 500 }),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: WEB_SEARCH_MAX_LIMIT })),
})

type WebSearchInput = Static<typeof WebSearchParameters>

/** 创建由指定供应商执行的标准只读网络搜索工具。 */
export function createWebSearchTool(provider: WebSearchProvider): RuntimeToolDefinition {
  return {
    ...WEB_SEARCH_TOOL_METADATA,
    parameters: WebSearchParameters,
    safety: 'read-only',
    reversible: false,
    executionMode: 'parallel',
    summarizeInput: (input) => (input as WebSearchInput).query,
    async execute(input, context) {
      const request = input as WebSearchInput
      context.signal.throwIfAborted()
      context.progress({ label: 'Searching the web', current: 1, total: 1 })
      try {
        const sources = await provider.search(
          { query: request.query, limit: request.limit ?? WEB_SEARCH_DEFAULT_LIMIT },
          { signal: context.signal },
        )
        context.signal.throwIfAborted()
        const result = formatWebSearchResult(sources, context.toolCallId)
        return {
          content: result.content,
          citations: result.citations,
          summary: sources.length ? `Found ${sources.length} web results.` : 'No web results found.',
        }
      } catch {
        context.signal.throwIfAborted()
        return {
          content: 'Web search could not complete. Retry with a more specific query.',
          summary: 'Web search failed.',
          failure: {
            code: 'TOOL_ERROR',
            message: 'Web search could not complete.',
            retryable: true,
            recommendedAction: 'Retry with a more specific query.',
          },
        }
      }
    },
  }
}
