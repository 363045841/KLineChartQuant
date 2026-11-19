// 验证浏览器 Agent bridge 可通过 runtime 根入口完成 Provider 目录请求。

import type {
  AgentChartSymbolContextItem,
  AgentWorkspaceEvent,
  AskUserOutcome,
} from '@363045841yyt/klinechart-agent-runtime'
import { AgentRuntimeError } from '@363045841yyt/klinechart-agent-runtime'
import { createMemoryRuntimeSessions } from '@363045841yyt/klinechart-agent-runtime/testing'
import {
  ERROR_CODES,
  KLineChartError,
  MARKET_QUERY_ERROR_CODES,
} from '@363045841yyt/klinechart-core'
import type { ChartAgentController } from '@363045841yyt/klinechart-core/controllers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserAgentBridge as ProductionBrowserAgentBridge } from '../browser-agent/bridge/impl/browser-agent-bridge'
import { BrowserToolRegistry } from '../browser-agent/tools/impl/browser-tool-registry'
import { createOpenAiCompatibleFetchStub } from './_agentProviderFixtures'
import { readStoredAgentModelSettings } from './_agentSettingsFixtures'
import {
  createTestChartAgent,
  createTestChartAgentContext,
  createTestToolDeps,
} from './_testChartAgent'
import { BrowserAgentBridge } from './browser-agent-fixture'

/** 清理每个测试写入的浏览器全局状态；LocalStorage 由全局 test-setup 统一清理。 */
afterEach(() => {
  vi.unstubAllGlobals()
})

/** Exa 托管 MCP 的成功响应；free 与 key 两种调用共用同一份结果格式。 */
function exaMcpResponse(): Response {
  const payload = {
    jsonrpc: '2.0',
    id: 1,
    result: {
      content: [
        {
          type: 'text',
          text: [
            'Title: Search result',
            'URL: https://example.com',
            'Published: N/A',
            'Author: N/A',
            'Highlights:',
            'Result snippet',
          ].join('\n'),
        },
      ],
    },
  }
  return new Response(`event: message\ndata: ${JSON.stringify(payload)}\n\n`, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

/** 装配仅含测试依赖的 Agent 工具注册表。 */
function createTestToolRegistry(): BrowserToolRegistry {
  return new BrowserToolRegistry({
    fetch,
    getWebSearchApiKey: () => undefined,
    requestQuestion: async (): Promise<AskUserOutcome> => ({
      status: 'answered',
      answer: { selectedValues: [] },
    }),
  })
}

/** 取出读取结果中的真实条目。 */
function entriesOf(view: import('../agent-contracts').AgentTranscriptView) {
  return view.items.flatMap((item) => (item.kind === 'entry' ? [item.entry] : []))
}

/** 读取用户条目正文。 */
function userText(entry: ReturnType<typeof entriesOf>[number] | undefined): string | undefined {
  const message = entry?.model?.[0]
  if (message?.role !== 'user') return undefined
  return typeof message.content === 'string'
    ? message.content
    : message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
}

/** 轮询会话读取结果，直到指定用户输入之后的助手回答落盘。 */
async function waitForAnswer(
  bridge: BrowserAgentBridge,
  sessionId: string,
  prompt: string,
): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const entries = entriesOf(await bridge.openSession(sessionId))
    const userIndex = entries.findIndex(
      (entry) => entry.kind === 'pi.user' && userText(entry) === prompt,
    )
    const answered =
      userIndex >= 0 &&
      entries.slice(userIndex + 1).some((entry) => {
        const message = entry.model?.[0]
        return (
          entry.kind === 'pi.assistant' &&
          message?.role === 'assistant' &&
          message.content.some((block) => block.type === 'text' && block.text.length > 0)
        )
      })
    if (answered) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`The Agent did not answer '${prompt}' in time.`)
}

/** 保存一个 Provider 连接，把默认 chart-model 加入模型池并选中。 */
async function connectChartProvider(
  bridge: BrowserAgentBridge,
  options: { profileName: string; baseUrl?: string; apiKey?: string },
): Promise<void> {
  await bridge.saveProvider({
    baseUrl: options.baseUrl ?? 'https://provider.example/v1',
    apiKey: options.apiKey ?? 'test-key',
    protocol: 'openai-completions',
    profileName: options.profileName,
  })
  await bridge.addProviderModelPoolModel({
    id: 'chart-model',
    name: 'Chart model',
  })
  await bridge.setProviderModel('chart-model')
}

describe('BrowserAgentBridge', () => {
  it('persists the enabled state of registered Agent tools', async () => {
    const bridge = new BrowserAgentBridge()

    await expect(bridge.listTools()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'instruments_query', enabled: true }),
      ]),
    )
    await bridge.setToolEnabled('instruments_query', false)
    await expect(bridge.listTools()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'instruments_query', enabled: false }),
      ]),
    )
    await expect(new BrowserAgentBridge().listTools()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'instruments_query', enabled: false }),
      ]),
    )
  })

  it('searches through the free Exa channel when no key is configured', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => exaMcpResponse(),
    )
    vi.stubGlobal('fetch', fetchMock)
    const bridge = new BrowserAgentBridge()

    await expect(bridge.listTools()).resolves.toContainEqual(
      expect.objectContaining({
        name: 'web_search',
        enabled: true,
      }),
    )
    await expect(bridge.debugTool('web_search', { query: 'KLineChart' })).resolves.toMatchObject({
      summary: 'Found 1 web results.',
    })
    expect(new Headers(fetchMock.mock.calls[0]![1]?.headers).get('x-api-key')).toBe(null)
  })

  it('requests the Provider model catalog with the supplied credential', async () => {
    const fetchMock = createOpenAiCompatibleFetchStub()
    vi.stubGlobal('fetch', fetchMock)
    const bridge = new BrowserAgentBridge()
    await bridge.saveProvider({
      baseUrl: 'https://provider.example/v1',
      apiKey: 'test-key',
      protocol: 'openai-completions',
      profileName: 'Provider example',
    })

    await expect(bridge.listProviderModelCatalog()).resolves.toMatchObject({
      models: [{ id: 'chart-model', name: 'Chart model' }],
    })

    expect(fetchMock).toHaveBeenCalledWith('https://provider.example/v1/models', {
      headers: { Accept: 'application/json', Authorization: 'Bearer test-key' },
    })
  })

  it('persists a completed Provider connection before a model is selected', async () => {
    const bridge = new BrowserAgentBridge()
    await bridge.createProviderProfile('Provider example')

    await expect(
      bridge.saveProvider({
        baseUrl: 'https://provider.example/v1',
        apiKey: 'draft-key',
        protocol: 'openai-completions',
        profileName: 'Provider example',
      }),
    ).resolves.toBeUndefined()

    await expect(bridge.getProviderStatus()).resolves.toMatchObject({
      configured: true,
      baseUrl: 'https://provider.example/v1',
      profileName: 'Provider example',
    })
  })

  it('clears the Profile model state when its connection identity changes', async () => {
    const bridge = new BrowserAgentBridge()
    await connectChartProvider(bridge, {
      profileName: 'Provider example',
      baseUrl: 'https://provider-one.example/v1',
    })

    await bridge.saveProvider({
      baseUrl: 'https://provider-two.example/v1',
      apiKey: 'test-key',
      protocol: 'openai-completions',
      profileName: 'Provider example',
    })

    await expect(bridge.listProviderModelPool()).resolves.toEqual([])
    const status = await bridge.getProviderStatus()
    expect(status).toMatchObject({ state: 'not-configured' })
    expect(status).not.toHaveProperty('modelId')
  })

  it('saves a Provider connection and reports a connected status once a model is chosen', async () => {
    vi.stubGlobal('fetch', createOpenAiCompatibleFetchStub())
    const bridge = new BrowserAgentBridge()

    await bridge.saveProvider({
      baseUrl: 'https://provider.example/v1',
      apiKey: 'test-key',
      protocol: 'openai-completions',
      profileName: 'Provider example',
    })
    const catalog = await bridge.listProviderModelCatalog()
    for (const model of catalog.models) await bridge.addProviderModelPoolModel(model)
    await bridge.setProviderModel('chart-model')

    await expect(bridge.getProviderStatus()).resolves.toMatchObject({
      state: 'connected',
      modelId: 'chart-model',
      protocol: 'openai-completions',
    })
  })

  it('persists multiple Provider profiles and switches the active runtime configuration', async () => {
    vi.stubGlobal('fetch', createOpenAiCompatibleFetchStub())
    const bridge = new BrowserAgentBridge()
    const first = {
      baseUrl: 'https://provider-one.example/v1',
      apiKey: 'first-key',
    }
    const second = {
      baseUrl: 'https://provider-two.example/v1',
      apiKey: 'second-key',
    }

    await bridge.createProviderProfile('Provider one')
    await connectChartProvider(bridge, {
      profileName: 'Provider one',
      baseUrl: first.baseUrl,
      apiKey: first.apiKey,
    })
    await bridge.createProviderProfile('Provider two')
    await connectChartProvider(bridge, {
      profileName: 'Provider two',
      baseUrl: second.baseUrl,
      apiKey: second.apiKey,
    })

    const profiles = await bridge.listProviderProfiles()
    expect(profiles).toMatchObject([
      { name: 'Provider one', baseUrl: first.baseUrl },
      { name: 'Provider two', baseUrl: second.baseUrl },
    ])
    expect(JSON.stringify(profiles)).not.toContain('first-key')
    expect(JSON.stringify(profiles)).not.toContain('second-key')

    await bridge.selectProviderProfile(profiles[0]!.name)
    await expect(bridge.getProviderStatus()).resolves.toMatchObject({
      state: 'connected',
      baseUrl: first.baseUrl,
    })
  })

  it('uses the configuration name as its unique key when saving updates', async () => {
    const bridge = new BrowserAgentBridge()
    const profileName = 'My provider'

    await bridge.saveProvider({
      baseUrl: 'https://provider-one.example/v1',
      apiKey: 'first-key',
      protocol: 'openai-completions',
      profileName,
    })
    await bridge.saveProvider({
      baseUrl: 'https://provider-two.example/v1',
      apiKey: 'second-key',
      protocol: 'openai-completions',
      profileName,
    })

    await expect(bridge.listProviderProfiles()).resolves.toEqual([
      {
        name: profileName,
        baseUrl: 'https://provider-two.example/v1',
        modelId: '',
        modelName: '',
        protocol: 'openai-completions',
        contextWindow: undefined,
        maxOutputTokens: undefined,
        reasoningEffort: undefined,
        reasoningEfforts: undefined,
      },
    ])
    expect(readStoredAgentModelSettings()).not.toHaveProperty('profiles.0.settings')
  })

  it('adds a named configuration to the group before its connection details are saved', async () => {
    const bridge = new BrowserAgentBridge()

    await bridge.createProviderProfile('New provider')

    await expect(bridge.listProviderProfiles()).resolves.toEqual([
      {
        name: 'New provider',
        baseUrl: '',
        modelId: '',
        modelName: '',
        protocol: 'openai-responses',
      },
    ])
    await expect(bridge.getProviderStatus()).resolves.toMatchObject({
      profileName: 'New provider',
      configured: false,
    })
  })

  it('renames a saved Provider configuration and keeps its model pool', async () => {
    const bridge = new BrowserAgentBridge()
    await bridge.saveProvider({
      baseUrl: 'https://provider.example/v1',
      apiKey: 'test-key',
      protocol: 'openai-completions',
      profileName: 'Provider one',
    })
    await bridge.addProviderModelPoolModel({
      id: 'chart-model',
      name: 'Chart model',
    })

    await bridge.renameProviderProfile('Provider one', 'Provider renamed')

    await expect(bridge.listProviderProfiles()).resolves.toMatchObject([
      { name: 'Provider renamed' },
    ])
    await expect(bridge.getProviderStatus()).resolves.toMatchObject({
      profileName: 'Provider renamed',
    })
    await expect(bridge.listProviderModelPool()).resolves.toEqual([
      expect.objectContaining({ provider: 'Provider renamed', id: 'chart-model' }),
    ])
  })

  it('falls back to a remaining configuration when the active one is deleted', async () => {
    const bridge = new BrowserAgentBridge()
    await bridge.createProviderProfile('Provider one')
    await bridge.saveProvider({
      baseUrl: 'https://provider.example/v1',
      apiKey: 'test-key',
      protocol: 'openai-completions',
      profileName: 'Provider one',
    })
    await bridge.addProviderModelPoolModel({
      id: 'chart-model',
      name: 'Chart model',
    })
    await bridge.createProviderProfile('Provider two')

    await bridge.deleteProviderProfile('Provider two')

    await expect(bridge.listProviderProfiles()).resolves.toMatchObject([{ name: 'Provider one' }])
    await expect(bridge.getProviderStatus()).resolves.toMatchObject({
      profileName: 'Provider one',
    })
    await expect(bridge.listProviderModelPool()).resolves.toEqual([
      expect.objectContaining({ provider: 'Provider one', id: 'chart-model' }),
    ])
  })

  it('removes a pooled model and clears the selection when it was active', async () => {
    const bridge = new BrowserAgentBridge()
    await connectChartProvider(bridge, { profileName: 'Provider example' })

    const pool = await bridge.removeProviderModelPoolModel('chart-model')

    expect(pool).toEqual([])
    await expect(bridge.getProviderStatus()).resolves.toMatchObject({ state: 'not-configured' })
  })

  it('persists one global Exa key and sends it to the hosted MCP endpoint', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => exaMcpResponse(),
    )
    vi.stubGlobal('fetch', fetchMock)
    const bridge = new BrowserAgentBridge()

    await bridge.saveWebSearchApiKey('exa-key')
    await bridge.createProviderProfile('Provider one')
    await bridge.createProviderProfile('Provider two')
    await bridge.selectProviderProfile('Provider one')
    expect(readStoredAgentModelSettings()).toMatchObject({ exaApiKey: 'exa-key' })
    await expect(bridge.listTools()).resolves.toContainEqual(
      expect.objectContaining({ name: 'web_search', enabled: true }),
    )
    await expect(bridge.getProviderStatus()).resolves.toMatchObject({ exaConfigured: true })
    await expect(bridge.debugTool('web_search', { query: 'KLineChart' })).resolves.toMatchObject({
      summary: 'Found 1 web results.',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://mcp.exa.ai/mcp',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(new Headers(fetchMock.mock.calls[0]![1]?.headers).get('x-api-key')).toBe('exa-key')
    expect(JSON.stringify(await bridge.listProviderProfiles())).not.toContain('exa-key')
  })

  it('clears the global Exa key so web search falls back to the free quota', async () => {
    const bridge = new BrowserAgentBridge()

    await bridge.saveWebSearchApiKey('exa-key')
    await bridge.saveWebSearchApiKey('')

    await expect(bridge.getProviderStatus()).resolves.toMatchObject({ exaConfigured: false })
    expect(readStoredAgentModelSettings()).not.toHaveProperty('exaApiKey')
  })

  it('migrates a legacy Profile Exa key into the global Agent settings', async () => {
    window.localStorage.setItem(
      'agent.model-settings',
      JSON.stringify({
        profiles: [
          { name: 'Legacy provider', apiKey: '', exaApiKey: 'legacy-exa-key', active: true },
        ],
        modelPool: [],
        enabledTools: [],
      }),
    )
    const bridge = new BrowserAgentBridge()

    await expect(bridge.getProviderStatus()).resolves.toMatchObject({ exaConfigured: true })
    expect(readStoredAgentModelSettings()).toMatchObject({ exaApiKey: 'legacy-exa-key' })
    expect(readStoredAgentModelSettings()).not.toHaveProperty('profiles.0.exaApiKey')
  })

  it('keeps an opened transcript isolated from a new run', async () => {
    const bridge = new BrowserAgentBridge()
    await connectChartProvider(bridge, { profileName: 'Provider example' })
    const [session] = await bridge.listSessions()
    const opened = await bridge.openSession(session!.id)

    await bridge.startRun({ sessionId: session!.id, prompt: 'Analyze RSI', mode: 'plan' })

    expect(opened.items).toEqual([])
  })

  it('retries and edits through official conversation branches', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          [
            'data: {"id":"chat-1","object":"chat.completion.chunk","created":1,"model":"chart-model","choices":[{"index":0,"delta":{"role":"assistant","content":"回答"},"finish_reason":null}]}\n',
            'data: {"id":"chat-1","object":"chat.completion.chunk","created":1,"model":"chart-model","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n',
            'data: [DONE]\n',
          ].join('\n'),
          { headers: { 'Content-Type': 'text/event-stream' } },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const bridge = new BrowserAgentBridge()
    await connectChartProvider(bridge, { profileName: 'Provider example' })
    const [session] = await bridge.listSessions()

    await bridge.startRun({ sessionId: session!.id, prompt: '分析 RSI', mode: 'plan' })
    await waitForAnswer(bridge, session!.id, '分析 RSI')
    const userEntry = entriesOf(await bridge.openSession(session!.id)).find(
      (entry) => entry.kind === 'pi.user',
    )
    expect(userEntry).toBeDefined()

    const retried = await bridge.retryRun({
      sessionId: session!.id,
      entryId: userEntry!.id,
      mode: 'plan',
    })
    expect(retried.sessionId).not.toBe(session!.id)
    await waitForAnswer(bridge, retried.sessionId, '分析 RSI')
    expect((await bridge.listSessions()).map((item) => item.id)).toEqual([retried.sessionId])

    const retriedUser = entriesOf(await bridge.openSession(retried.sessionId)).find(
      (entry) => entry.kind === 'pi.user',
    )
    const edited = await bridge.editMessage({
      sessionId: retried.sessionId,
      entryId: retriedUser!.id,
      prompt: '分析 EMA',
      mode: 'plan',
    })
    await waitForAnswer(bridge, edited.sessionId, '分析 EMA')
    const branchUser = entriesOf(await bridge.openSession(edited.sessionId)).find(
      (entry) => entry.kind === 'pi.user',
    )
    expect(branchUser ? userText(branchUser) : undefined).toBe('分析 EMA')
    expect((await bridge.listSessions()).map((item) => item.id)).toEqual([edited.sessionId])
  })

  it('includes completed turns in the next Provider request', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          [
            'data: {"id":"chat-1","object":"chat.completion.chunk","created":1,"model":"chart-model","choices":[{"index":0,"delta":{"role":"assistant","content":"第一轮回答"},"finish_reason":null}]}\n',
            'data: {"id":"chat-1","object":"chat.completion.chunk","created":1,"model":"chart-model","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n',
            'data: [DONE]\n',
          ].join('\n'),
          { headers: { 'Content-Type': 'text/event-stream' } },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const bridge = new BrowserAgentBridge()
    await connectChartProvider(bridge, { profileName: 'Provider example' })
    const [session] = await bridge.listSessions()

    await bridge.startRun({ sessionId: session!.id, prompt: '第一轮问题', mode: 'plan' })
    await waitForAnswer(bridge, session!.id, '第一轮问题')
    await bridge.startRun({ sessionId: session!.id, prompt: '你刚刚说了什么', mode: 'plan' })
    await waitForAnswer(bridge, session!.id, '你刚刚说了什么')

    const secondRequest = JSON.parse(String(fetchMock.mock.calls[1]![1]?.body)) as {
      messages: Array<{ role: string; content: unknown }>
    }
    expect(secondRequest.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: '第一轮问题' }),
        expect.objectContaining({ role: 'assistant' }),
      ]),
    )
  })

  it('subscribes after a chart controller becomes available', () => {
    const context = createTestChartAgentContext()
    const agent = createTestChartAgent({ context, getContext: context })
    const bridge = new BrowserAgentBridge()
    const received: Array<string | null> = []

    bridge.subscribeContextItems((items) => {
      const symbol = items.find(
        (item): item is AgentChartSymbolContextItem => item.kind === 'chart-symbol',
      )
      received.push(symbol?.value.symbol ?? null)
    })
    bridge.bindChartAgent(agent)
    context.set({ ...context(), symbol: 'ETHUSDT' })

    expect(received).toEqual([null, 'BTCUSDT', 'ETHUSDT'])
  })

  it('projects selected ranges as dates in the instrument timezone', () => {
    const context = createTestChartAgentContext({
      timezone: 'America/New_York',
      visibleRange: {
        from: Date.parse('2026-09-02T01:30:00Z'),
        to: Date.parse('2026-09-02T02:45:00Z'),
      },
      selectedKLineBars:
        'market bars | symbol=BTCUSDT\n\n| time | open | high | low | close | volume |',
    })
    const bridge = new BrowserAgentBridge()

    bridge.bindChartAgent(createTestChartAgent({ context }))

    expect(bridge.getContextItems()).toContainEqual({
      kind: 'selected-time-range',
      value: { from: '2026-09-01 21:30', to: '2026-09-01 22:45' },
    })
    expect(bridge.getContextItems()).toContainEqual({
      kind: 'selected-kline-bars',
      value: {
        content: 'market bars | symbol=BTCUSDT\n\n| time | open | high | low | close | volume |',
      },
    })
  })

  it('projects selected drawings as one drawing-selection context item', () => {
    const context = createTestChartAgentContext({
      visibleRange: null,
      drawingSelection: {
        selectedIds: ['line-1', 'line-2'],
        drawings: [
          {
            id: 'line-1',
            kind: 'trend-line',
            row: 0,
            visible: true,
            locked: false,
            zIndex: null,
            anchors: [
              { time: '2026-09-01T09:30:00+08:00', price: 10 },
              { time: '2026-09-02T09:30:00+08:00', price: 11 },
            ],
            style: { stroke: '#2962ff', fill: undefined },
            labels: { line: {}, area: {} },
            timeframeVisibility: { mode: 'all' },
          },
          {
            id: 'line-2',
            kind: 'horizontal-line',
            row: 0,
            visible: true,
            locked: true,
            zIndex: 2,
            anchors: [{ price: 11 }],
            style: { stroke: '#f00' },
            labels: { line: {}, area: {} },
            timeframeVisibility: { mode: 'all' },
          },
        ],
      },
    })
    const agent = createTestChartAgent({ context })
    const bridge = new BrowserAgentBridge()

    bridge.bindChartAgent(agent)

    expect(bridge.getContextItems()).toContainEqual({
      kind: 'drawing-selection',
      value: {
        selectedIds: ['line-1', 'line-2'],
        drawings: [
          expect.objectContaining({ id: 'line-1', style: { stroke: '#2962ff' } }),
          expect.objectContaining({ id: 'line-2', style: { stroke: '#f00' } }),
        ],
      },
    })
  })

  it('runs a write tool through the manual debug entrypoint', async () => {
    const create = vi.fn(() => ({
      id: 'drawing-1',
      kind: 'horizontal-line' as const,
      row: 0,
      visible: true,
      locked: false,
      zIndex: null,
      anchors: [{ price: 9 }],
      style: { stroke: '#2962ff' },
      labels: { line: {}, area: {} },
      timeframeVisibility: { mode: 'all' as const },
      visibleInCurrentPeriod: true,
    }))
    const agent = createTestChartAgent({
      tools: createTestToolDeps({
        drawings: {
          list: () => ({ timezone: 'UTC', period: '1h', drawings: [] }),
          create,
          update: () => {
            throw new Error('not used')
          },
          remove: () => {
            throw new Error('not used')
          },
        },
      }),
    })
    const bridge = new BrowserAgentBridge({ getChartAgent: () => agent })

    await expect(
      bridge.debugTool('drawings_write', {
        action: 'create',
        row: 0,
        kind: 'horizontal-line',
        anchors: [{ price: 9 }],
        style: { stroke: '#4A90D9' },
      }),
    ).resolves.toMatchObject({ content: expect.stringContaining('drawing-1') })
    expect(create).toHaveBeenCalledOnce()
  })

  it.each([
    {
      name: '取数失败可重试，并带出结构化细节',
      error: new KLineChartError(ERROR_CODES.FETCH_FAILED, 'Upstream is down.', {
        details: { source: 'tdx' },
      }),
      expected: { retryable: true, details: { source: 'tdx' } },
    },
    {
      name: '非交易日不可重试，错误里带出最近的交易日',
      error: new KLineChartError(
        MARKET_QUERY_ERROR_CODES.INVALID_TRADING_DATE,
        '2026-11-15 is not a trading day.',
        { details: { requested: '2026-11-15', previous: '2026-11-14' } },
      ),
      expected: {
        retryable: false,
        details: { requested: '2026-11-15', previous: '2026-11-14' },
      },
    },
  ])('把行情工具失败原样交给模型：$name', async ({ error, expected }) => {
    const agent = createTestChartAgent({
      tools: createTestToolDeps({
        market: {
          listSources: () => [],
          lookup: async () => ({ content: '', summary: '' }),
          bars: async () => {
            throw error
          },
          timeShare: async () => ({ content: '', summary: '' }),
          indicatorValues: async () => '',
        },
      }),
    })
    const bridge = new BrowserAgentBridge({ getChartAgent: () => agent })

    const result = await bridge.debugTool('market_bars_query', { symbol: 'BTCUSDT' })
    expect(JSON.parse(result.content)).toMatchObject({
      success: false,
      error: { code: error.code, ...expected },
    })
  })

  it('settles a pending question as an answer or as a skip', async () => {
    const bridge = new BrowserAgentBridge()
    const required: Extract<AgentWorkspaceEvent, { type: 'tool.question.required' }>[] = []
    const resolved: Extract<AgentWorkspaceEvent, { type: 'tool.question.resolved' }>[] = []
    bridge.subscribe((event) => {
      if (event.type === 'tool.question.required') required.push(event)
      if (event.type === 'tool.question.resolved') resolved.push(event)
    })

    const ask = () =>
      bridge.debugTool('ask_user', {
        question: 'Which instrument?',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      })

    const answered = ask()
    await bridge.answerQuestion(required[0]!.request.id, { selectedValues: ['a'] })
    await expect(answered).resolves.toMatchObject({
      content: JSON.stringify({ status: 'answered', selected: ['a'] }),
    })

    const skipped = ask()
    await bridge.cancelQuestion(required[1]!.request.id)
    await expect(skipped).resolves.toMatchObject({
      content: JSON.stringify({ status: 'cancelled' }),
      summary: expect.stringContaining('declined'),
    })

    expect(resolved.map((event) => event.status)).toEqual(['answered', 'cancelled'])
  })

  it('exposes only read tools in plan mode and every tool in build mode', () => {
    const registry = createTestToolRegistry()
    const agent = createTestChartAgent()

    expect(registry.resolveTools({ agent, mode: 'plan' }).map((tool) => tool.name)).toEqual([
      'indicators_list',
      'drawings_list',
      'comparisons_list',
      'instruments_query',
      'market_bars_query',
      'market_timeshare_query',
      'indicator_values_query',
      'web_search',
      'ask_user',
    ])
    expect(registry.resolveTools({ agent, mode: 'build' }).map((tool) => tool.name)).toContain(
      'indicators_write',
    )
  })

  it('lists every host tool once, regardless of the bound chart', () => {
    const registry = createTestToolRegistry()
    const names = registry.listTools().map((tool) => tool.name)
    expect(names).toHaveLength(12)
    expect(new Set(names).size).toBe(12)
    expect(names).toContain('indicators_write')
    expect(names).toContain('ask_user')
  })

  it('retries runtime initialization after a locked start and closes safely', async () => {
    let attempts = 0
    const bridge = new ProductionBrowserAgentBridge({
      createSessions: async () => {
        attempts += 1
        if (attempts === 1) {
          throw new AgentRuntimeError(
            'SESSION_LOCKED',
            'Agent sessions are open in another page.',
            { retryable: true },
          )
        }
        return createMemoryRuntimeSessions()
      },
    })

    await expect(bridge.listSessions()).rejects.toMatchObject({ code: 'SESSION_LOCKED' })
    await expect(bridge.close()).resolves.toBeUndefined()
    await expect(bridge.listSessions()).resolves.toEqual([
      expect.objectContaining({ title: expect.any(String) }),
    ])
    await bridge.close()
  })
})
