// 本文件实现 Exa 网络搜索供应商：免费额度与自有 Key 共用托管 MCP 端点。
//
// Exa 不为 api.exa.ai/search 提供免费档，无凭据请求直接返回 402；
// keyless 只开在托管 MCP 这一侧，所以这里只有一个传输实现：
// 一次 stateless 的 tools/call，自有 Key 只是多一个 x-api-key 头。
import { AgentRuntimeError } from '../../contracts/errors.js'
import { DEFAULT_WEB_SEARCH_LIMIT } from '../types.js'
import type { WebSearchProvider, WebSearchRequest, WebSearchSource } from '../types.js'

/** Exa 托管 MCP 端点；免费额度与自有额度都走这里。 */
const EXA_MCP_URL = 'https://mcp.exa.ai/mcp'
const EXA_SEARCH_TOOL = 'web_search_exa'
const MCP_ACCEPT = 'application/json, text/event-stream'
/** 结果块之间的分隔线；Exa 的文本格式只有这一处结构可依赖。 */
const BLOCK_SEPARATOR = '\n---\n\n'
const TITLE_PREFIX = 'Title: '
const URL_PREFIX = 'URL: '
const PUBLISHED_PREFIX = 'Published: '
const HIGHLIGHTS_PREFIX = 'Highlights:'
/** 上游用 N/A 表示未知，它不是有效日期。 */
const UNKNOWN_PUBLISHED = 'N/A'

interface ExaWebSearchProviderOptions {
  /** 用户自己的 Exa Key；省略时使用 Exa 的免费共享额度。 */
  readonly apiKey?: string
  readonly fetch?: typeof globalThis.fetch
}

/** MCP 响应的最小可读形状；除此之外的字段一律忽略。 */
interface McpResponse {
  readonly result?: {
    readonly content?: unknown
    readonly isError?: unknown
  }
  readonly error?: {
    readonly message?: unknown
  }
}

/** 判断未知值是否为可读取字段的对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 判断未知值是否具备 MCP 信封外形。 */
function isMcpResponse(value: unknown): value is McpResponse {
  return isRecord(value)
}

/** 响应体不是可解析的 MCP 信封时，如实报解析失败，不猜测内容。 */
function malformedResponse(detail: string): AgentRuntimeError {
  return new AgentRuntimeError(
    'PROVIDER_MALFORMED_RESPONSE',
    `Exa returned a web search response the runtime could not read: ${detail}`,
    { retryable: false, recommendedAction: 'Retry with a different query.' },
  )
}

/** 网络层失败统一报可重试的不可用；取消由调用方先行上抛。 */
function unreachable(cause: unknown): AgentRuntimeError {
  return new AgentRuntimeError('PROVIDER_UNAVAILABLE', 'Web search could not reach Exa.', {
    retryable: true,
    recommendedAction: 'Retry the search.',
    cause,
  })
}

/**
 * 把上游状态映射成运行时错误。
 *
 * `recommendedAction` 直接写成模型要对用户说的话：免费额度用尽与网络受限都需要用户
 * 自己配置 Key，模型不应把一个额度问题当成查询问题反复重试。
 */
function exaFailure(status: number, hasApiKey: boolean, raw?: string): AgentRuntimeError {
  const diagnostic = raw === undefined ? {} : { raw }
  if (status === 401) {
    return new AgentRuntimeError('PROVIDER_AUTHENTICATION', 'The Exa API key was rejected.', {
      retryable: false,
      recommendedAction:
        'Tell the user the saved Exa API key is invalid, and ask them to replace or clear it in Agent settings.',
      ...diagnostic,
    })
  }
  if (status === 403) {
    return new AgentRuntimeError(
      'PROVIDER_PERMISSION',
      'Exa refused web search for this connection.',
      {
        retryable: false,
        recommendedAction:
          'Tell the user the free web search channel needs a direct IPv4 connection, and that saving an Exa API key in Agent settings bypasses it.',
        ...diagnostic,
      },
    )
  }
  if (status === 429) {
    return new AgentRuntimeError(
      'PROVIDER_RATE_LIMITED',
      hasApiKey
        ? 'The Exa web search quota for the saved key is exhausted.'
        : 'The free Exa web search quota is exhausted.',
      {
        retryable: false,
        recommendedAction: hasApiKey
          ? 'Tell the user the saved Exa key has no remaining web search quota; do not retry now.'
          : 'Tell the user the free web search quota is used up, and that saving an Exa API key in Agent settings gives them their own quota. Do not retry now.',
        ...diagnostic,
      },
    )
  }
  if (status >= 500) {
    return new AgentRuntimeError('PROVIDER_UNAVAILABLE', 'Exa web search is unavailable.', {
      retryable: true,
      recommendedAction: 'Retry the search.',
      ...diagnostic,
    })
  }
  return new AgentRuntimeError('PROVIDER_UNAVAILABLE', 'Exa rejected the web search request.', {
    retryable: false,
    recommendedAction: 'Retry with a different query.',
    ...diagnostic,
  })
}

/** 无法归类的上游失败：如实报可重试的失败并附原文。 */
function upstreamFailure(raw: string): AgentRuntimeError {
  return new AgentRuntimeError('PROVIDER_UNAVAILABLE', 'Exa web search failed.', {
    retryable: true,
    recommendedAction: 'Retry the search.',
    raw,
  })
}

/** 读取 JSON-RPC 层错误；限流只以文本形式出现，是唯一可按内容分类的失败。 */
function rpcFailure(message: string, hasApiKey: boolean): AgentRuntimeError {
  return /rate\s*limit/i.test(message) ? exaFailure(429, hasApiKey, message) : upstreamFailure(message)
}

/** 读取工具级错误；Key 无效时 HTTP 仍是 200，状态码只写在正文开头。 */
function toolFailure(text: string, hasApiKey: boolean): AgentRuntimeError {
  const status = /\((\d{3})\)/.exec(text)?.[1]
  if (status !== undefined) return exaFailure(Number(status), hasApiKey, text)
  return /rate\s*limit/i.test(text) ? exaFailure(429, hasApiKey, text) : upstreamFailure(text)
}

/** 从 SSE 响应体里取出 JSON-RPC 信封；Exa 在这个 `Accept` 下只回 `text/event-stream`。 */
function readResponseEnvelope(body: string): McpResponse {
  const data = body
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice('data: '.length))
    .join('\n')
  let payload: unknown
  try {
    payload = JSON.parse(data)
  } catch {
    throw malformedResponse('the body is not JSON.')
  }
  if (!isMcpResponse(payload)) throw malformedResponse('the body is not a JSON object.')
  return payload
}

/** 拼接工具返回的文本块；引用与结果都在文本里，非文本块没有可消费内容。 */
function readToolText(content: unknown): string {
  if (!Array.isArray(content)) throw malformedResponse('the tool result has no content.')
  const parts: string[] = []
  for (const item of content) {
    if (!isRecord(item)) continue
    if (item.type !== 'text' || typeof item.text !== 'string') continue
    parts.push(item.text)
  }
  return parts.join('\n')
}

/** 把 Exa 的文本结果拆成标准化来源；缺少标题或地址的块不具备引用价值。 */
function parseSources(text: string): WebSearchSource[] {
  const sources: WebSearchSource[] = []
  for (const block of text.split(BLOCK_SEPARATOR)) {
    const lines = block.split('\n')
    let title: string | undefined
    let url: string | undefined
    let publishedAt: string | undefined
    let snippet = ''
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      if (line === undefined) continue
      if (line.startsWith(TITLE_PREFIX)) {
        title = line.slice(TITLE_PREFIX.length).trim()
      } else if (line.startsWith(URL_PREFIX)) {
        url = line.slice(URL_PREFIX.length).trim()
      } else if (line.startsWith(PUBLISHED_PREFIX)) {
        const value = line.slice(PUBLISHED_PREFIX.length).trim()
        if (value.length > 0 && value !== UNKNOWN_PUBLISHED) publishedAt = value
      } else if (line.startsWith(HIGHLIGHTS_PREFIX)) {
        snippet = lines.slice(index + 1).join('\n').trim()
        break
      }
    }
    if (!title || !url) continue
    sources.push({ title, url, snippet, ...(publishedAt === undefined ? {} : { publishedAt }) })
  }
  return sources
}

/**
 * 创建 Exa 网络搜索供应商。
 *
 * @param options.apiKey 自有 Key；省略时使用免费共享额度。
 * @param options.fetch 供宿主注入的 fetch 实现。
 * @returns 只负责一次搜索请求的供应商。
 */
export function createExaWebSearchProvider(
  options: ExaWebSearchProviderOptions = {},
): WebSearchProvider {
  const fetchImplementation = options.fetch ?? globalThis.fetch
  const apiKey = options.apiKey?.trim() ?? ''
  const hasApiKey = apiKey.length > 0
  const headers: Record<string, string> = {
    Accept: MCP_ACCEPT,
    'Content-Type': 'application/json',
  }
  if (hasApiKey) headers['x-api-key'] = apiKey

  return {
    async search(request: WebSearchRequest, context): Promise<readonly WebSearchSource[]> {
      let response: Response
      try {
        response = await fetchImplementation(EXA_MCP_URL, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: EXA_SEARCH_TOOL,
              arguments: {
                query: request.query,
                numResults: request.limit ?? DEFAULT_WEB_SEARCH_LIMIT,
              },
            },
          }),
          signal: context.signal,
        })
      } catch (error) {
        context.signal.throwIfAborted()
        throw unreachable(error)
      }

      if (!response.ok) throw exaFailure(response.status, hasApiKey)

      let body: string
      try {
        body = await response.text()
      } catch (error) {
        context.signal.throwIfAborted()
        throw unreachable(error)
      }

      const envelope = readResponseEnvelope(body)
      if (envelope.error !== undefined) {
        const message =
          typeof envelope.error.message === 'string' ? envelope.error.message : 'Unknown error.'
        throw rpcFailure(message, hasApiKey)
      }
      const text = readToolText(envelope.result?.content)
      if (envelope.result?.isError === true) throw toolFailure(text, hasApiKey)
      const sources = parseSources(text)
      // 文本里出现了结果块标记却一条都没解析出来，说明上游格式变了：
      // 这必须报格式错误，不能伪装成「没有搜索结果」。
      if (sources.length === 0 && text.includes(TITLE_PREFIX.trim())) {
        throw malformedResponse('no result block could be parsed.')
      }
      return sources
    },
  }
}
