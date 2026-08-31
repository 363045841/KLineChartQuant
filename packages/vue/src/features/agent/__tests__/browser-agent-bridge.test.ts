// 验证浏览器 Agent bridge 可通过 runtime 根入口完成 Provider 目录请求。
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BrowserAgentBridge } from '../browser-agent-bridge'

import type { ChartAgentController } from '@363045841yyt/klinechart-core/controllers'

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

    await bridge.testProvider(first)
    await bridge.saveProvider({ ...first, modelName: 'Chart model', profileName: 'Provider one' })
    await bridge.testProvider(second)
    await bridge.saveProvider({ ...second, modelName: 'Chart model', profileName: 'Provider two' })

    const profiles = await bridge.listProviderProfiles()
    expect(profiles).toMatchObject([
      { name: 'Provider one', baseUrl: first.baseUrl },
      { name: 'Provider two', baseUrl: second.baseUrl },
    ])
    expect(JSON.stringify(profiles)).not.toContain('first-key')
    expect(JSON.stringify(profiles)).not.toContain('second-key')

    await bridge.selectProviderProfile(profiles[0]!.id)
    await expect(bridge.getProviderStatus()).resolves.toMatchObject({
      state: 'connected',
      baseUrl: first.baseUrl,
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

  it('subscribes after a chart controller becomes available', () => {
    const listeners = new Set<() => void>()
    let symbol = 'BTCUSDT'
    const context = Object.assign(
      () => ({
        chartId: 'chart-1',
        symbol,
        market: 'crypto',
        exchange: 'BINANCE',
        period: '1h',
        dataSource: 'fixture',
        timezone: null,
        adjustMode: null,
        dataRange: { from: 1, to: 2, bars: 2 },
        visibleRange: { from: 1, to: 2 },
        activeIndicators: [],
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
    } as ChartAgentController
    const bridge = new BrowserAgentBridge()
    const received: Array<string | null> = []

    bridge.subscribeChartContext((value) => received.push(value?.symbol ?? null))
    bridge.bindChartAgent(agent)
    symbol = 'ETHUSDT'
    for (const listener of listeners) listener()

    expect(received).toEqual([null, 'BTCUSDT', 'ETHUSDT'])
  })

  it('rewrites persisted v1 settings with an explicit protocol', async () => {
    window.localStorage.setItem('agent.provider.apiKey', 'test-key')
    window.localStorage.setItem(
      'agent.provider.settings',
      JSON.stringify({
        version: 1,
        baseUrl: 'https://provider.example/v1',
        modelId: 'chart-model',
        modelName: 'Chart model',
        compatibility: 'compatible',
        lastTestedAt: 10,
        lastModelsRefreshAt: 9,
      }),
    )

    const bridge = new BrowserAgentBridge()
    await expect(bridge.getProviderStatus()).resolves.toMatchObject({
      state: 'connected',
      protocol: 'openai-completions',
    })
    expect(
      JSON.parse(window.localStorage.getItem('agent.provider.settings') ?? '{}'),
    ).toMatchObject({ version: 2, protocol: 'openai-completions' })
  })
})
