// 本文件定义网络搜索供应商与运行时工具共享的最小数据契约。

/** 单次搜索的默认结果数；工具与供应商共用同一个来源，避免两处各写一个 5。 */
export const DEFAULT_WEB_SEARCH_LIMIT = 5

/** 单次网络搜索请求。 */
export interface WebSearchRequest {
  readonly query: string
  readonly limit?: number
}

/** 可供 Agent 引用的搜索结果来源。 */
export interface WebSearchSource {
  readonly title: string
  readonly url: string
  readonly snippet: string
  readonly publishedAt?: string
}

/** 可替换的网络搜索供应商。 */
export interface WebSearchProvider {
  /** 执行搜索并返回标准化来源。 */
  search(
    request: WebSearchRequest,
    context: { readonly signal: AbortSignal },
  ): Promise<readonly WebSearchSource[]>
}
