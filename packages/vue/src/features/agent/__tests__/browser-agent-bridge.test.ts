// 验证浏览器 Agent bridge 可通过 runtime 根入口完成 Provider 目录请求。
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BrowserAgentBridge } from '../browser-agent-bridge'

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
    })

    await expect(bridge.getProviderStatus()).resolves.toMatchObject({
      state: 'connected',
      modelId: 'chart-model',
      protocol: 'openai-completions',
    })
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
