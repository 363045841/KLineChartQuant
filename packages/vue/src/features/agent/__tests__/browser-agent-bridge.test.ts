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

describe('BrowserAgentBridge', () => {
  it('requests the Provider model catalog with the supplied credential', async () => {
    const fetchMock = vi.fn(async () => modelsResponse())
    vi.stubGlobal('fetch', fetchMock)
    const bridge = new BrowserAgentBridge()

    await expect(
      bridge.listProviderModels({ baseUrl: 'https://provider.example/v1', apiKey: 'test-key' }),
    ).resolves.toMatchObject({ models: [{ id: 'chart-model', name: 'Chart model' }] })

    expect(fetchMock).toHaveBeenCalledWith('https://provider.example/v1/models', {
      headers: { Accept: 'application/json', Authorization: 'Bearer test-key' },
    })
  })

  it('saves a successfully tested Provider and reports a connected status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => modelsResponse()))
    const bridge = new BrowserAgentBridge()

    await expect(
      bridge.testProvider({
        baseUrl: 'https://provider.example/v1',
        apiKey: 'test-key',
        model: 'chart-model',
      }),
    ).resolves.toMatchObject({ compatible: true, model: 'chart-model' })

    await bridge.saveProvider({
      baseUrl: 'https://provider.example/v1',
      apiKey: 'test-key',
      model: 'chart-model',
      modelName: 'Chart model',
    })

    await expect(bridge.getProviderStatus()).resolves.toMatchObject({
      state: 'connected',
      modelId: 'chart-model',
    })
  })
})
