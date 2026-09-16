// 验证注入外部凭据存储后 API Key 不再落入 localStorage，且默认路径保持原有行为。
import { afterEach, describe, expect, it } from 'vitest'

import { BrowserAgentBridge } from '../browser-agent-bridge'

import type { ProviderCredentialStore } from '@363045841yyt/klinechart-agent-runtime'

const PROFILES_KEY = 'agent.provider.profiles'

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

/** 等待构造期发起的迁移任务跑完。 */
async function flushMigration(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

/** 返回 localStorage 中持久化的 profile JSON 原文。 */
function storedProfilesJson(): string {
  return window.localStorage.getItem(PROFILES_KEY) ?? ''
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

    expect(storedProfilesJson()).not.toContain('sk-secret-value')
    expect(credentials.value).toBe('sk-secret-value')
    // Profile 本身仍然持久化，只是 apiKey 字段为空。
    expect(JSON.parse(storedProfilesJson())).toMatchObject([
      { name: 'Provider example', apiKey: '' },
    ])
  })

  it('still persists the API key in localStorage when no store is injected', async () => {
    const bridge = new BrowserAgentBridge()

    await bridge.saveProvider({
      baseUrl: 'https://provider.example/v1',
      apiKey: 'sk-web-value',
      protocol: 'openai-completions',
      profileName: 'Provider example',
    })

    expect(storedProfilesJson()).toContain('sk-web-value')
  })

  it('migrates a legacy plaintext key into the injected store and clears it', async () => {
    window.localStorage.setItem(
      PROFILES_KEY,
      JSON.stringify([{ name: 'Legacy', apiKey: 'sk-legacy', active: true }]),
    )
    const credentials = createFakeStore()

    new BrowserAgentBridge({ credentials })
    await flushMigration()

    expect(credentials.value).toBe('sk-legacy')
    expect(storedProfilesJson()).not.toContain('sk-legacy')
  })

  it('does not overwrite an existing encrypted key during migration', async () => {
    window.localStorage.setItem(
      PROFILES_KEY,
      JSON.stringify([{ name: 'Legacy', apiKey: 'sk-legacy', active: true }]),
    )
    const credentials = createFakeStore('sk-encrypted')

    new BrowserAgentBridge({ credentials })
    await flushMigration()

    expect(credentials.value).toBe('sk-encrypted')
    expect(storedProfilesJson()).not.toContain('sk-legacy')
  })

  it('leaves the legacy plaintext key untouched when the store rejects the write', async () => {
    window.localStorage.setItem(
      PROFILES_KEY,
      JSON.stringify([{ name: 'Legacy', apiKey: 'sk-legacy', active: true }]),
    )
    const credentials: ProviderCredentialStore = {
      async read() {
        return undefined
      },
      async write() {
        throw new Error('encryption unavailable')
      },
      async delete() {},
    }

    new BrowserAgentBridge({ credentials })
    await flushMigration()

    // 清除只会丢失凭据而换不来安全收益，状态保持为升级前的样子。
    expect(storedProfilesJson()).toContain('sk-legacy')
  })
})
