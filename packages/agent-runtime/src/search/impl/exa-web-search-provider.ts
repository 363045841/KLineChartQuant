// 本文件将 Exa Search API 响应转换为运行时统一的网络搜索来源。
import type { WebSearchProvider, WebSearchRequest, WebSearchSource } from '../types.js'

const EXA_SEARCH_URL = 'https://api.exa.ai/search'

interface ExaWebSearchProviderOptions {
  readonly apiKey: string
  readonly fetch?: typeof globalThis.fetch
}

/** 判断未知值是否为可读取字段的对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 将 Exa 单条响应转换为运行时来源；缺少标题或地址的结果不具备引用价值。 */
function toSource(value: unknown): WebSearchSource | undefined {
  if (!isRecord(value) || typeof value.title !== 'string' || typeof value.url !== 'string')
    return undefined
  return {
    title: value.title,
    url: value.url,
    snippet: typeof value.text === 'string' ? value.text : '',
    publishedAt: typeof value.publishedDate === 'string' ? value.publishedDate : undefined,
  }
}

/** 创建使用 Exa Search API 的网络搜索供应商。 */
export function createExaWebSearchProvider(
  options: ExaWebSearchProviderOptions,
): WebSearchProvider {
  const fetchImplementation = options.fetch ?? globalThis.fetch

  return {
    async search(request: WebSearchRequest, context): Promise<readonly WebSearchSource[]> {
      const response = await fetchImplementation(EXA_SEARCH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'x-api-key': options.apiKey,
        },
        body: JSON.stringify({
          query: request.query,
          numResults: request.limit ?? 5,
          contents: { text: true },
        }),
        signal: context.signal,
      })
      if (!response.ok) throw new Error('Exa Search API request failed.')
      const payload: unknown = await response.json()
      if (!isRecord(payload) || !Array.isArray(payload.results)) {
        throw new Error('Exa Search API returned an invalid response.')
      }
      const sources: WebSearchSource[] = []
      for (const result of payload.results) {
        const source = toSource(result)
        if (source) sources.push(source)
      }
      return sources
    },
  }
}
