// 验证浏览器 Agent bridge 可通过 runtime 根入口完成 Provider 目录请求。
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BrowserAgentBridge } from '../browser-agent-bridge'

import type { ChartAgentController } from '@363045841yyt/klinechart-core/controllers'
import type {
  AgentChartSymbolContextItem,
  RuntimeToolDefinition,
} from '@363045841yyt/klinechart-agent-runtime'

/** 清理每个测试写入的浏览器全局状态。 */
afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

/** 返回 OpenAI-compatible Provider 的最小模型目录响应。 */
function modelsResponse(): Response {
  return new Response(JSON.stringify({ data: [{ id: 'chart-model', name: 'Chart model' }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** 返回包含目录、文本与函数探针的 Chat Completions 测试端点。 */
function providerResponse(input: RequestInfo | URL, init?: RequestInit): Response {
  if (String(input).endsWith('/models')) return modelsResponse()
  const body = JSON.parse(String(init?.body)) as Record<string, unknown>
  if (!Array.isArray(body.tools)) {
    return new Response(
      JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'OK' } }] }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  }
  const tool = body.tools[0] as {
    function: { name: string; parameters: { properties: { nonce: { const: string } } } }
  }
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            role: 'assistant',
            tool_calls: [
              {
                type: 'function',
                function: {
                  name: tool.function.name,
                  arguments: JSON.stringify({
                    nonce: tool.function.parameters.properties.nonce.const,
                  }),
                },
              },
            ],
          },
        },
      ],
    }),
    { headers: { 'Content-Type': 'application/json' } },
  )
}

describe('BrowserAgentBridge', () => {
  it('persists the enabled state of registered Agent tools', async () => {
    const bridge = new BrowserAgentBridge()

    await expect(bridge.listTools()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'instruments_query_name', enabled: true }),
      ]),
    )
    await bridge.setToolEnabled('instruments_query_name', false)
    await expect(bridge.listTools()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'instruments_query_name', enabled: false }),
      ]),
    )
    await expect(new BrowserAgentBridge().listTools()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'instruments_query_name', enabled: false }),
      ]),
    )
  })

  it('requests the Provider model catalog with the supplied credential', async () => {
    const fetchMock = vi.fn(async () => modelsResponse())
    vi.stubGlobal('fetch', fetchMock)
    const bridge = new BrowserAgentBridge()

    await expect(
      bridge.listProviderModels({
        baseUrl: 'https://provider.example/v1',
        apiKey: 'test-key',
        protocol: 'openai-completions',
      }),
    ).resolves.toMatchObject({ models: [{ id: 'chart-model', name: 'Chart model' }] })

    expect(fetchMock).toHaveBeenCalledWith('https://provider.example/v1/models', {
      headers: { Accept: 'application/json', Authorization: 'Bearer test-key' },
    })
  })

  it('saves a successfully tested Provider and reports a connected status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input, init) => providerResponse(input, init)),
    )
    const bridge = new BrowserAgentBridge()

    await expect(
      bridge.testProvider({
        baseUrl: 'https://provider.example/v1',
        apiKey: 'test-key',
        model: 'chart-model',
        protocol: 'openai-completions',
      }),
    ).resolves.toMatchObject({ compatible: true, model: 'chart-model' })

    await bridge.saveProvider({
      baseUrl: 'https://provider.example/v1',
      apiKey: 'test-key',
      model: 'chart-model',
      modelName: 'Chart model',
      protocol: 'openai-completions',
      profileName: 'Provider example',
    })

    await expect(bridge.getProviderStatus()).resolves.toMatchObject({
      state: 'connected',
      modelId: 'chart-model',
      protocol: 'openai-completions',
    })
  })

  it('persists multiple Provider profiles and switches the active runtime configuration', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input, init) => providerResponse(input, init)),
    )
    const bridge = new BrowserAgentBridge()
    const first = {
      baseUrl: 'https://provider-one.example/v1',
      apiKey: 'first-key',
      model: 'chart-model',
      protocol: 'openai-completions' as const,
    }
    const second = {
      baseUrl: 'https://provider-two.example/v1',
      apiKey: 'second-key',
      model: 'chart-model',
      protocol: 'openai-completions' as const,
    }

    await bridge.createProviderProfile('Provider one')
    await bridge.testProvider(first)
    await bridge.saveProvider({ ...first, modelName: 'Chart model', profileName: 'Provider one' })
    await bridge.createProviderProfile('Provider two')
    await bridge.testProvider(second)
    await bridge.saveProvider({ ...second, modelName: 'Chart model', profileName: 'Provider two' })

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
      model: 'first-model',
      modelName: 'First model',
      protocol: 'openai-completions',
      profileName,
    })
    await bridge.saveProvider({
      baseUrl: 'https://provider-two.example/v1',
      apiKey: 'second-key',
      model: 'second-model',
      modelName: 'Second model',
      protocol: 'openai-completions',
      profileName,
    })

    await expect(bridge.listProviderProfiles()).resolves.toEqual([
      {
        name: profileName,
        baseUrl: 'https://provider-two.example/v1',
        modelId: 'second-model',
        modelName: 'Second model',
        protocol: 'openai-completions',
      },
    ])
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

  it('saves and enables a Provider without a connection test', async () => {
    const bridge = new BrowserAgentBridge()

    await bridge.saveProvider({
      baseUrl: 'https://provider.example/v1',
      apiKey: 'test-key',
      model: 'chart-model',
      modelName: 'Chart model',
      profileName: 'Untested provider',
      protocol: 'openai-completions',
    })

    await expect(bridge.getProviderStatus()).resolves.toMatchObject({
      state: 'connected',
      baseUrl: 'https://provider.example/v1',
      modelId: 'chart-model',
    })
  })

  it('keeps an opened message snapshot isolated from a new run', async () => {
    const bridge = new BrowserAgentBridge()
    const [session] = await bridge.listSessions()
    const snapshot = await bridge.openSession(session!.id)

    await bridge.startRun({ sessionId: session!.id, prompt: 'Analyze RSI', readOnly: true })

    expect(snapshot.messages).toEqual([])
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
    await bridge.saveProvider({
      baseUrl: 'https://provider.example/v1',
      apiKey: 'test-key',
      model: 'chart-model',
      modelName: 'Chart model',
      protocol: 'openai-completions',
      profileName: 'Provider example',
    })
    const [session] = await bridge.listSessions()

    const waitForCompletion = () =>
      new Promise<void>((resolve) => {
        const unsubscribe = bridge.subscribe((event) => {
          if (event.type !== 'run.completed') return
          unsubscribe()
          resolve()
        })
      })

    const firstCompleted = waitForCompletion()
    await bridge.startRun({ sessionId: session!.id, prompt: '第一轮问题', readOnly: true })
    await firstCompleted
    const secondCompleted = waitForCompletion()
    await bridge.startRun({ sessionId: session!.id, prompt: '你刚刚说了什么', readOnly: true })
    await secondCompleted

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
    const listeners = new Set<() => void>()
    let symbol = 'BTCUSDT'
    const context = Object.assign(
      () => ({
        chartId: 'chart-1',
        symbol,
        symbolName: null,
        market: 'crypto',
        exchange: 'BINANCE',
        period: '1h',
        dataSource: 'fixture',
        timezone: null,
        adjustMode: null,
        dataRange: { from: 1, to: 2, bars: 2 },
        visibleRange: { from: 1, to: 2 },
        activeIndicators: [],
        drawingSelection: null,
        dataRevision: 1,
      }),
      {
        peek: () => context(),
        subscribe(listener: () => void) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
      },
    )
    const agent = {
      context,
      getContext: context,
      queryIndicator: () => Promise.resolve(''),
      searchInstruments: () => Promise.resolve([]),
      lookupInstrumentsBySymbol: () => Promise.resolve([]),
    } as ChartAgentController
    const bridge = new BrowserAgentBridge()
    const received: Array<string | null> = []

    bridge.subscribeContextItems((items) => {
      const symbol = items.find(
        (item): item is AgentChartSymbolContextItem => item.kind === 'chart-symbol',
      )
      received.push(symbol?.value.symbol ?? null)
    })
    bridge.bindChartAgent(agent)
    symbol = 'ETHUSDT'
    for (const listener of listeners) listener()

    expect(received).toEqual([null, 'BTCUSDT', 'ETHUSDT'])
  })

  it('projects selected drawings as one drawing-selection context item', () => {
    const context = Object.assign(
      () => ({
        chartId: 'chart-1',
        symbol: 'BTCUSDT',
        symbolName: null,
        market: 'crypto',
        exchange: 'BINANCE',
        period: 'kline',
        dataSource: 'fixture',
        timezone: null,
        adjustMode: null,
        dataRange: { from: 1, to: 2, bars: 2 },
        visibleRange: null,
        activeIndicators: [],
        drawingSelection: {
          selectedIds: ['line-1', 'line-2'],
          drawings: [
            {
              id: 'line-1',
              kind: 'trend-line',
              paneId: 'main',
              visible: true,
              locked: false,
              zIndex: null,
              anchors: [{ timestamp: 1, price: 10 }],
              style: { stroke: '#2962ff', fill: undefined },
            },
            {
              id: 'line-2',
              kind: 'horizontal-line',
              paneId: 'main',
              visible: true,
              locked: true,
              zIndex: 2,
              anchors: [{ timestamp: null, price: 11 }],
              style: { stroke: '#f00' },
            },
          ],
        },
        dataRevision: 1,
      }),
      { peek: () => context(), subscribe: () => () => {} },
    )
    const agent = { context } as unknown as ChartAgentController
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

  it('executes destructive tools through the manual debug entrypoint', async () => {
    const drawingCommands = {
      create: vi.fn(() => ({
        id: 'drawing-1',
        kind: 'horizontal-line',
        paneId: 'main',
        visible: true,
        anchors: [{ id: 'anchor-1', index: 0, time: Date.parse('2026-09-02'), price: 9 }],
        params: {},
        style: { stroke: '#2962ff', strokeWidth: 1, strokeStyle: 'solid' },
      })),
    }
    const agent = {
      getAvailableMarketDataSourceIds: () => [],
      getAvailableDrawingPaneIds: () => ['main'],
      dependencies: { drawingCommands },
    } as unknown as ChartAgentController
    const bridge = new BrowserAgentBridge({ getChartAgent: () => agent })

    await expect(
      bridge.debugTool('drawing_create', {
        kind: 'horizontal-line',
        paneId: 'main',
        anchors: [{ time: '2026-09-02', price: 9 }],
      }),
    ).resolves.toMatchObject({ summary: 'Tool completed.' })
    expect(drawingCommands.create).toHaveBeenCalledOnce()
  })

  it('adds the exact runtime pane IDs to the create-drawing tool description', () => {
    const agent = {
      getAvailableMarketDataSourceIds: () => [],
      getAvailableDrawingPaneIds: () => ['main', 'volume'],
    } as unknown as ChartAgentController
    const bridge = new BrowserAgentBridge()
    const createRegisteredTools = (
      bridge as unknown as {
        createRegisteredTools(
          agent: ChartAgentController,
          readOnly: boolean,
        ): readonly RuntimeToolDefinition[]
      }
    ).createRegisteredTools(agent, false)

    expect(
      createRegisteredTools.find((tool) => tool.name === 'drawing_create')?.description,
    ).toContain('Available runtime paneIds: main, volume.')
  })
})
