// 验证网络搜索供应商适配与运行时工具的标准契约。
import { describe, expect, it, vi } from 'vitest'

import { createExaWebSearchProvider } from '../search/exa.js'
import { createWebSearchTool } from '../search/web-search-tool.js'
import { RuntimeToolCatalog } from '../tools/runtime-tool-registry.js'

describe('web search', () => {
  it('maps an Exa response to standard sources', async () => {
    const fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              title: 'KLineChart docs',
              url: 'https://example.com/docs',
              text: 'Documentation content.',
              publishedDate: '2026-09-08',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    const provider = createExaWebSearchProvider({ apiKey: 'exa-key', fetch })

    await expect(
      provider.search({ query: 'KLineChart', limit: 3 }, { signal: new AbortController().signal }),
    ).resolves.toEqual([
      {
        title: 'KLineChart docs',
        url: 'https://example.com/docs',
        snippet: 'Documentation content.',
        publishedAt: '2026-09-08',
      },
    ])
    expect(fetch).toHaveBeenCalledWith(
      'https://api.exa.ai/search',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'x-api-key': 'exa-key',
        },
        body: JSON.stringify({
          query: 'KLineChart',
          numResults: 3,
          contents: { text: true },
        }),
      }),
    )
  })

  it('returns sources in the Agent tool result', async () => {
    const search = vi.fn(async () => [
      { title: 'Result', url: 'https://example.com', snippet: 'Snippet' },
    ])
    const tool = createWebSearchTool({ search })

    const result = await tool.execute(
      { query: 'example' },
      {
        runId: 'run-1',
        toolCallId: 'tool-1',
        signal: new AbortController().signal,
        progress: () => undefined,
      },
    )

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

  it('reports when a registered tool cannot be enabled', () => {
    const registry = new RuntimeToolCatalog<{ enabled: boolean }>()
    registry.register({
      name: 'web_search',
      label: 'Web search',
      description: 'Search the web.',
      check: ({ enabled }) => (enabled ? undefined : 'Configure Web search first.'),
      create: () => createWebSearchTool({ search: async () => [] }),
    })

    expect(registry.list({ enabled: false })).toEqual([
      {
        name: 'web_search',
        label: 'Web search',
        description: 'Search the web.',
        available: false,
        unavailableReason: 'Configure Web search first.',
      },
    ])
    expect(registry.resolve({ enabled: false })).toEqual([])
  })
})
