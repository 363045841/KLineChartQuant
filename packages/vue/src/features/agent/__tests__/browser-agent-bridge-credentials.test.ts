// 验证注入外部凭据存储后 API Key 不会进入 Agent 模型设置文档。

import type { ProviderCredentialStore } from '@363045841yyt/klinechart-agent-runtime'
import { afterEach, describe, expect, it } from 'vitest'
import { BrowserAgentBridge } from '../browser-agent-bridge'

const AGENT_MODEL_SETTINGS_KEY = 'agent.model-settings'

afterEach(() => {
  window.localStorage.clear()
})

/** 内存凭据存储，代替 Electron safeStorage。 */
function createFakeStore(initial?: string): ProviderCredentialStore & { value?: string } {
  return {
    value: initial,
    async read() {
      return this.value
    },
    async write(apiKey: string) {
      this.value = apiKey
    },
    async delete() {
      this.value = undefined
    },
  }
}

/** 返回 LocalStorage 中持久化的 Agent 模型设置 JSON 原文。 */
function storedAgentModelSettingsJson(): string {
  return window.localStorage.getItem(AGENT_MODEL_SETTINGS_KEY) ?? ''
}

describe('BrowserAgentBridge credential injection', () => {
  it('keeps the API key out of localStorage and routes it to the injected store', async () => {
    const credentials = createFakeStore()
    const bridge = new BrowserAgentBridge({ credentials })

    await bridge.saveProvider({
      baseUrl: 'https://provider.example/v1',
      apiKey: 'sk-secret-value',
      protocol: 'openai-completions',
      profileName: 'Provider example',
    })

    expect(storedAgentModelSettingsJson()).not.toContain('sk-secret-value')
    expect(credentials.value).toBe('sk-secret-value')
    // Profile 本身仍然持久化，只是 apiKey 字段为空。
    expect(JSON.parse(storedAgentModelSettingsJson())).toMatchObject({
      profiles: [{ name: 'Provider example', apiKey: '' }],
    })
  })

  it('still persists the API key in localStorage when no store is injected', async () => {
    const bridge = new BrowserAgentBridge()

    await bridge.saveProvider({
      baseUrl: 'https://provider.example/v1',
      apiKey: 'sk-web-value',
      protocol: 'openai-completions',
      profileName: 'Provider example',
    })

    expect(storedAgentModelSettingsJson()).toContain('sk-web-value')
  })
})
