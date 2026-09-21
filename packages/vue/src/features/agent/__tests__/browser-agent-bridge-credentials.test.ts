// 验证注入外部凭据存储后 API Key 不会进入 Agent 模型设置文档。

import { InMemoryProviderCredentialStore } from '@363045841yyt/klinechart-agent-runtime'
import { describe, expect, it } from 'vitest'
import { BrowserAgentBridge } from '../browser-agent-bridge'
import {
  readStoredAgentModelSettings,
  storedAgentModelSettingsJson,
} from './_agentSettingsFixtures'

describe('BrowserAgentBridge credential injection', () => {
  it('keeps the API key out of localStorage and routes it to the injected store', async () => {
    const credentials = new InMemoryProviderCredentialStore()
    const bridge = new BrowserAgentBridge({ credentials })

    await bridge.saveProvider({
      baseUrl: 'https://provider.example/v1',
      apiKey: 'sk-secret-value',
      protocol: 'openai-completions',
      profileName: 'Provider example',
    })

    expect(storedAgentModelSettingsJson()).not.toContain('sk-secret-value')
    await expect(credentials.read()).resolves.toBe('sk-secret-value')
    // Profile 本身仍然持久化，只是 apiKey 字段为空。
    expect(readStoredAgentModelSettings()).toMatchObject({
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
