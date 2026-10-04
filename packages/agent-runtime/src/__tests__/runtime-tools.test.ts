// 覆盖 ask_user 工具、运行时工具目录与网络搜索适配的真实执行路径。
import { describe, expect, it, vi } from 'vitest'

import {
  ASK_USER_TOOL_NAME,
  RuntimeToolCatalog,
  createAskUserTool,
  createExaWebSearchProvider,
  createWebSearchTool,
  type AskUserHost,
  type RuntimeToolDefinition,
} from '../index'
import { formatWebSearchResult } from '../search/web-search-formatter.js'

function toolContext(signal = new AbortController().signal) {
  return {
    runId: 'run-1',
    toolCallId: 'call-1',
    signal,
    progress: vi.fn(),
  }
}

describe('createAskUserTool', () => {
  const question = {
    question: 'Which BTC market do you mean?',
    options: [
      { value: 'binance:btcusdt', label: 'Binance BTCUSDT' },
      { value: 'okx:btcusdt', label: 'OKX BTCUSDT' },
    ],
  }

  it('declares the blocking, read-only contract the run driver depends on', () => {
    const tool = createAskUserTool({ request: vi.fn() })
    expect(tool.name).toBe(ASK_USER_TOOL_NAME)
    expect(tool.safety).toBe('read-only')
    expect(tool.reversible).toBe(false)
    expect(tool.executionMode).toBe('sequential')
    expect(tool.waitsForUserInput).toBe(true)
    expect(tool.summarizeInput?.(question)).toBe('Which BTC market do you mean?')
  })

  it('forwards the question to the host and reports the selected values', async () => {
    const request = vi.fn(async () => ({ selectedValues: ['okx:btcusdt'], note: 'prefer OKX' }))
    const tool = createAskUserTool({ request } as unknown as AskUserHost)
    const context = toolContext()

    const result = await tool.execute(question, context)

    expect(request).toHaveBeenCalledWith(
      { prompt: question.question, options: question.options, multiSelect: false },
      { runId: 'run-1', toolCallId: 'call-1', signal: context.signal },
    )
    expect(JSON.parse(result.content as string)).toEqual({
      status: 'answered',
      selected: ['okx:btcusdt'],
      note: 'prefer OKX',
    })
    expect(result.summary).toBe('User selected: okx:btcusdt.')
  })

  it('passes multiSelect through and omits an absent note', async () => {
    const request = vi.fn(async () => ({ selectedValues: ['a', 'b'] }))
    const tool = createAskUserTool({ request } as unknown as AskUserHost)
    const result = await tool.execute({ ...question, multiSelect: true }, toolContext())
    expect((request.mock.calls[0] as unknown as [unknown])[0]).toMatchObject({ multiSelect: true })
    expect(JSON.parse(result.content as string)).toEqual({
      status: 'answered',
      selected: ['a', 'b'],
    })
    expect(result.summary).toBe('User selected: a, b.')
  })

  it('summarizes a free-text answer when nothing was selected', async () => {
    const tool = createAskUserTool({
      request: vi.fn(async () => ({ selectedValues: [], note: 'something else' })),
    } as unknown as AskUserHost)
    const result = await tool.execute(question, toolContext())
    expect(result.summary).toBe('User answered with free text.')
  })

  it('refuses to ask when the run is already aborted', async () => {
    const request = vi.fn()
    const tool = createAskUserTool({ request } as unknown as AskUserHost)
    await expect(
      tool.execute(question, toolContext(AbortSignal.abort(new Error('run cancelled')))),
    ).rejects.toThrow('run cancelled')
    expect(request).not.toHaveBeenCalled()
  })

  it('discards a host answer that arrives after cancellation', async () => {
    const controller = new AbortController()
    const tool = createAskUserTool({
      request: vi.fn(async () => {
        controller.abort(new Error('cancelled while waiting'))
        return { selectedValues: ['a'] }
      }),
    } as unknown as AskUserHost)
    await expect(tool.execute(question, toolContext(controller.signal))).rejects.toThrow(
      'cancelled while waiting',
    )
  })
})

describe('RuntimeToolCatalog', () => {
  interface HostContext {
    readonly hasApiKey: boolean
  }

  function stubTool(name: string): RuntimeToolDefinition {
    return {
      name,
      label: name,
      description: name,
      parameters: { type: 'object' } as never,
      safety: 'read-only',
      reversible: false,
      execute: async () => ({ content: name, summary: name }),
    }
  }

  it('rejects a duplicate registration as a host configuration error', () => {
    const catalog = new RuntimeToolCatalog<HostContext>()
    const factory = { name: 'web_search', label: 'Web', description: 'd', create: () => undefined }
    catalog.register(factory)
    expect(() => catalog.register(factory)).toThrow(
      "Runtime tool 'web_search' is already registered.",
    )
  })

  it('returns undefined when checking a tool that was never registered', () => {
    expect(new RuntimeToolCatalog<HostContext>().check('missing', { hasApiKey: true })).toBeUndefined()
  })

  it('reports availability from the registered check function', () => {
    const catalog = new RuntimeToolCatalog<HostContext>()
    catalog.register({
      name: 'web_search',
      label: 'Web search',
      description: 'Search the web',
      check: (context) => (context.hasApiKey ? undefined : 'Missing Exa API key.'),
      create: () => stubTool('web_search'),
    })
    catalog.register({
      name: 'ask_user',
      label: 'Ask question',
      description: 'Ask a question',
      create: () => stubTool('ask_user'),
    })

    expect(catalog.check('web_search', { hasApiKey: false })).toEqual({
      available: false,
      unavailableReason: 'Missing Exa API key.',
    })
    expect(catalog.check('web_search', { hasApiKey: true })).toEqual({ available: true })
    expect(catalog.check('ask_user', { hasApiKey: false })).toEqual({ available: true })
  })

  it('lists every registration with its current availability', () => {
    const catalog = new RuntimeToolCatalog<HostContext>()
    catalog.register({
      name: 'web_search',
      label: 'Web search',
      description: 'Search the web',
      check: (context) => (context.hasApiKey ? undefined : 'Missing Exa API key.'),
      create: () => stubTool('web_search'),
    })
    expect(catalog.list({ hasApiKey: false })).toEqual([
      {
        name: 'web_search',
        label: 'Web search',
        description: 'Search the web',
        available: false,
        unavailableReason: 'Missing Exa API key.',
      },
    ])
  })

  it('resolves only available factories that actually produce a tool', () => {
    const catalog = new RuntimeToolCatalog<HostContext>()
    catalog.register({
      name: 'web_search',
      label: 'Web search',
      description: 'Search the web',
      check: (context) => (context.hasApiKey ? undefined : 'Missing Exa API key.'),
      create: () => stubTool('web_search'),
    })
    catalog.register({
      name: 'ask_user',
      label: 'Ask question',
      description: 'Ask a question',
      create: () => stubTool('ask_user'),
    })
    catalog.register({
      name: 'opt_out',
      label: 'Opt out',
      description: 'Returns nothing',
      create: () => undefined,
    })

    expect(catalog.resolve({ hasApiKey: false }).map((tool) => tool.name)).toEqual(['ask_user'])
    expect(catalog.resolve({ hasApiKey: true }).map((tool) => tool.name)).toEqual([
      'web_search',
      'ask_user',
    ])
  })
})

describe('createExaWebSearchProvider', () => {
  const request = { query: 'KLineChart', limit: 3 }
  const context = { signal: new AbortController().signal }

  it('defaults numResults to 5 when the caller omits a limit', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 }))
    await createExaWebSearchProvider({ apiKey: 'exa-key', fetch }).search({ query: 'x' }, context)
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      query: 'x',
      numResults: 5,
      contents: { text: true },
    })
  })

  it('throws when the API rejects the request', async () => {
    const fetch = vi.fn(async () => new Response('nope', { status: 401 }))
    await expect(
      createExaWebSearchProvider({ apiKey: 'exa-key', fetch }).search(request, context),
    ).rejects.toThrow('Exa Search API request failed.')
  })

  it('throws when the payload has no results array', async () => {
    for (const payload of [{ items: [] }, [], 'results']) {
      const fetch = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }))
      await expect(
        createExaWebSearchProvider({ apiKey: 'exa-key', fetch }).search(request, context),
      ).rejects.toThrow('Exa Search API returned an invalid response.')
    }
  })

  it('drops results that cannot be cited and defaults a missing snippet', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            results: [
              null,
              'https://example.com',
              { url: 'https://example.com/no-title' },
              { title: 'No url' },
              { title: 'Usable', url: 'https://example.com/a' },
              { title: 'Dated', url: 'https://example.com/b', text: 'body', publishedDate: 7 },
            ],
          }),
          { status: 200 },
        ),
    )
    await expect(
      createExaWebSearchProvider({ apiKey: 'exa-key', fetch }).search(request, context),
    ).resolves.toEqual([
      { title: 'Usable', url: 'https://example.com/a', snippet: '', publishedAt: undefined },
      { title: 'Dated', url: 'https://example.com/b', snippet: 'body', publishedAt: undefined },
    ])
  })
})

describe('formatWebSearchResult', () => {
  it('numbers citable sources and drops non-http URLs', () => {
    const result = formatWebSearchResult(
      [
        { title: 'Http', url: 'http://example.com/a', snippet: 'a' },
        { title: 'Ftp', url: 'ftp://example.com/b', snippet: 'b' },
        { title: 'Garbage', url: 'not a url', snippet: 'c' },
        { title: 'Https', url: 'https://example.com/d', snippet: 'd' },
      ],
      'call-1',
    )
    expect(result.citations.map((citation) => citation.id)).toEqual([
      'web:call-1:1',
      'web:call-1:2',
    ])
    expect(result.citations.map((citation) => citation.url)).toEqual([
      'http://example.com/a',
      'https://example.com/d',
    ])
    expect(JSON.parse(result.content).citationExamples).toHaveLength(2)
  })
})

describe('createWebSearchTool', () => {
  it('reports a failure result instead of throwing when the provider fails', async () => {
    const tool = createWebSearchTool({
      search: vi.fn(async () => {
        throw new Error('exa exploded')
      }),
    })
    const result = await tool.execute({ query: 'btc' }, toolContext())
    expect(result.summary).toBe('Web search failed.')
    expect(result.failure).toEqual({
      code: 'TOOL_ERROR',
      message: 'Web search could not complete.',
      retryable: true,
      recommendedAction: 'Retry with a more specific query.',
    })
  })

  it('propagates cancellation rather than masking it as a tool failure', async () => {
    const controller = new AbortController()
    const tool = createWebSearchTool({
      search: vi.fn(async () => {
        controller.abort(new Error('run cancelled'))
        throw new Error('aborted fetch')
      }),
    })
    await expect(tool.execute({ query: 'btc' }, toolContext(controller.signal))).rejects.toThrow(
      'run cancelled',
    )
  })

  it('summarizes an empty result set without claiming results were found', async () => {
    const tool = createWebSearchTool({ search: vi.fn(async () => []) })
    const context = toolContext()
    const result = await tool.execute({ query: 'btc' }, context)
    expect(result.summary).toBe('No web results found.')
    expect(result.citations).toEqual([])
    expect(context.progress).toHaveBeenCalledWith({
      label: 'Searching the web',
      current: 1,
      total: 1,
    })
  })

  it('applies the default limit of 5 when the model omits one', async () => {
    const search = vi.fn(async () => [])
    const tool = createWebSearchTool({ search })
    await tool.execute({ query: 'btc' }, toolContext())
    expect((search.mock.calls[0] as unknown as [unknown])[0]).toEqual({ query: 'btc', limit: 5 })
    expect(tool.summarizeInput?.({ query: 'btc' })).toBe('btc')
  })
})
