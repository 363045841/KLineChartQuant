// 验证 Exa 网络搜索供应商的 MCP 传输、文本解析、错误分类与运行时工具契约。
import { describe, expect, it, vi } from 'vitest'

import { AgentRuntimeError } from '../../contracts/errors.js'
import { createExaWebSearchProvider } from '../impl/exa-web-search-provider.js'
import { createWebSearchTool } from '../impl/web-search-tool.js'

const SEARCH_TEXT = [
  'Title: KLineChart docs',
  'URL: https://example.com/docs',
  'Published: 2026-09-08',
  'Author: Exa',
  'Highlights:',
  'Documentation content.',
  '',
  '---',
  '',
  'Title: Second result',
  'URL: https://example.com/second',
  'Published: N/A',
  'Author: N/A',
  'Highlights:',
  'Second snippet.',
].join('\n')

/** 构造 Exa 托管 MCP 的 SSE 响应。 */
function sseResponse(payload: unknown, status = 200): Response {
  return new Response(`event: message\ndata: ${JSON.stringify(payload)}\n\n`, {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

/** 构造 tools/call 成功信封。 */
function toolEnvelope(text: string, isError = false): unknown {
  return { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text }], isError } }
}

/** 判断错误是否带运行时错误契约。 */
function isAgentRuntimeError(value: unknown): value is AgentRuntimeError {
  return value instanceof AgentRuntimeError
}

/** 取一次调用的失败原因；成功则让用例自身失败。 */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  let failure: unknown
  let resolved = false
  try {
    await promise
    resolved = true
  } catch (error) {
    failure = error
  }
  if (resolved) throw new Error('Expected the search to fail.')
  return failure
}

const searchContext = { signal: new AbortController().signal }

describe('createExaWebSearchProvider', () => {
  it.each([
    { name: '免费额度：不带 Key', apiKey: undefined, expectedKey: null },
    { name: '自有额度：携带 Key', apiKey: 'exa-key', expectedKey: 'exa-key' },
  ])('$name', async ({ apiKey, expectedKey }) => {
    const fetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => sseResponse(toolEnvelope(SEARCH_TEXT)),
    )
    const provider = createExaWebSearchProvider({ apiKey, fetch })

    await provider.search({ query: 'KLineChart', limit: 3 }, searchContext)

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(
      'https://mcp.exa.ai/mcp',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Accept: 'application/json, text/event-stream',
          'Content-Type': 'application/json',
        }),
      }),
    )
    const init = fetch.mock.calls[0]?.[1]
    expect(new Headers(init?.headers).get('x-api-key')).toBe(expectedKey)
    expect(JSON.parse(String(init?.body))).toEqual({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'web_search_exa',
        arguments: { query: 'KLineChart', numResults: 3 },
      },
    })
  })

  it('把文本块解析成标准化来源，未知日期不写入 publishedAt', async () => {
    const provider = createExaWebSearchProvider({
      fetch: async () => sseResponse(toolEnvelope(SEARCH_TEXT)),
    })

    await expect(provider.search({ query: 'KLineChart' }, searchContext)).resolves.toEqual([
      {
        title: 'KLineChart docs',
        url: 'https://example.com/docs',
        snippet: 'Documentation content.',
        publishedAt: '2026-09-08',
      },
      {
        title: 'Second result',
        url: 'https://example.com/second',
        snippet: 'Second snippet.',
      },
    ])
  })

  it.each([
    {
      name: 'Key 无效',
      response: sseResponse(toolEnvelope('web_search_exa error (401): Invalid API key.', true)),
      apiKey: 'exa-key',
      code: 'PROVIDER_AUTHENTICATION',
      retryable: false,
      recommendedAction: /replace or clear it/,
    },
    {
      name: '网络受限',
      response: sseResponse(toolEnvelope('web_search_exa error (403): Forbidden.', true)),
      apiKey: undefined,
      code: 'PROVIDER_PERMISSION',
      retryable: false,
      recommendedAction: /direct IPv4 connection/,
    },
    {
      name: '免费额度用尽',
      response: sseResponse(toolEnvelope('web_search_exa error (429): Too many requests.', true)),
      apiKey: undefined,
      code: 'PROVIDER_RATE_LIMITED',
      retryable: false,
      recommendedAction: /free web search quota is used up/,
    },
    {
      name: '自有额度用尽',
      response: sseResponse(toolEnvelope('web_search_exa error (429): Too many requests.', true)),
      apiKey: 'exa-key',
      code: 'PROVIDER_RATE_LIMITED',
      retryable: false,
      recommendedAction: /saved Exa key has no remaining/,
    },
    {
      name: 'JSON-RPC 限流',
      response: sseResponse({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32000, message: "You've hit Exa's free MCP rate limit." },
      }),
      apiKey: undefined,
      code: 'PROVIDER_RATE_LIMITED',
      retryable: false,
      recommendedAction: /free web search quota is used up/,
    },
    {
      name: '上游 5xx',
      response: sseResponse({}, 503),
      apiKey: 'exa-key',
      code: 'PROVIDER_UNAVAILABLE',
      retryable: true,
      recommendedAction: /Retry the search/,
    },
  ])('$name 映射为 $code', async ({ response, apiKey, code, retryable, recommendedAction }) => {
    const provider = createExaWebSearchProvider({
      apiKey,
      fetch: async () => response,
    })
    const failure = await rejectionOf(provider.search({ query: 'KLineChart' }, searchContext))

    if (!isAgentRuntimeError(failure)) throw new Error('Expected an AgentRuntimeError.')
    expect(failure.code).toBe(code)
    expect(failure.retryable).toBe(retryable)
    expect(failure.recommendedAction).toMatch(recommendedAction)
  })

  it('无法解析的响应报格式错误，不伪造结果', async () => {
    const provider = createExaWebSearchProvider({
      fetch: async () => new Response('event: message\ndata: not json\n\n', { status: 200 }),
    })
    const failure = await rejectionOf(provider.search({ query: 'KLineChart' }, searchContext))

    if (!isAgentRuntimeError(failure)) throw new Error('Expected an AgentRuntimeError.')
    expect(failure).toMatchObject({
      code: 'PROVIDER_MALFORMED_RESPONSE',
      retryable: false,
    })
  })

  it('出现结果块标记却解析不出结果时按格式错误处理', async () => {
    const provider = createExaWebSearchProvider({
      fetch: async () =>
        sseResponse(toolEnvelope('Title: broken block\nHighlights:\nno url here')),
    })
    const failure = await rejectionOf(provider.search({ query: 'KLineChart' }, searchContext))

    if (!isAgentRuntimeError(failure)) throw new Error('Expected an AgentRuntimeError.')
    expect(failure.code).toBe('PROVIDER_MALFORMED_RESPONSE')
  })

  it('上游明确没有结果时返回空列表', async () => {
    const provider = createExaWebSearchProvider({
      fetch: async () => sseResponse(toolEnvelope('No results found.')),
    })

    await expect(provider.search({ query: 'KLineChart' }, searchContext)).resolves.toEqual([])
  })
})

describe('createWebSearchTool', () => {
  const toolContext = {
    sessionId: 'session-1',
    runId: 'run-1',
    toolCallId: 'tool-1',
    signal: new AbortController().signal,
    progress: () => undefined,
  }

  it('把来源编号并返回引用标记', async () => {
    const search = vi.fn(async () => [
      { title: 'Result', url: 'https://example.com', snippet: 'Snippet' },
    ])
    const tool = createWebSearchTool({ search })

    const result = await tool.execute({ query: 'example' }, toolContext)

    expect(search).toHaveBeenCalledWith(
      { query: 'example', limit: 5 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(result).toMatchObject({
      summary: 'Found 1 web results.',
      citations: [
        {
          id: 'web:tool-1:1',
          title: 'Result',
          url: 'https://example.com',
          snippet: 'Snippet',
        },
      ],
    })
    expect(JSON.parse(result.content)).toMatchObject({
      sources: [{ id: 'web:tool-1:1', title: 'Result' }],
      citationExamples: ['[[cite:web:tool-1:1]]'],
    })
  })

  it('已知错误走统一失败信封，正文与 failure 同源', async () => {
    const error = new AgentRuntimeError(
      'PROVIDER_RATE_LIMITED',
      'The free Exa web search quota is exhausted.',
      {
        retryable: false,
        recommendedAction: 'Tell the user to save an Exa API key in Agent settings.',
      },
    )
    const tool = createWebSearchTool({
      search: async () => {
        throw error
      },
    })

    const result = await tool.execute({ query: 'example' }, toolContext)

    expect(result.failure).toEqual(error.toView())
    expect(JSON.parse(result.content)).toEqual({
      success: false,
      error: error.toView(),
      stateChanged: false,
    })
    expect(result.summary).toBe(error.message)
  })

  it('未知异常直接上抛，不伪装成工具结果', async () => {
    const tool = createWebSearchTool({
      search: async () => {
        throw new Error('boom')
      },
    })

    await expect(tool.execute({ query: 'example' }, toolContext)).rejects.toThrowError('boom')
  })

  it('取消向上传播，不转成失败结果', async () => {
    const controller = new AbortController()
    controller.abort()
    const tool = createWebSearchTool({
      search: async () => {
        throw new Error('unreachable')
      },
    })

    await expect(
      tool.execute({ query: 'example' }, { ...toolContext, signal: controller.signal }),
    ).rejects.toThrowError(/abort/i)
  })
})
