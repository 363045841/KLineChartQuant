// Provider 设置 store：真实宿主 + 真实页面客户端，走与浏览器一致的结构化克隆边界。

import {
  createHostClient,
  providerSettingsDocument,
} from '@363045841yyt/klinechart-agent-runtime/testing'
import { setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAgentProviderSettingsPinia,
  useAgentProviderSettingsStore,
} from '../impl/agent-provider-settings-store'

/** 只响应 `/models` 的 Provider fetch。 */
function catalogFetch() {
  return vi.fn<typeof globalThis.fetch>(async (input) => {
    if (String(input).endsWith('/models')) {
      return new Response(
        JSON.stringify({
          object: 'list',
          data: [
            { id: 'fast', name: 'Fast' },
            { id: 'slow', name: 'Slow' },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    return new Response('', { status: 404 })
  })
}

describe('AgentProviderSettingsStore', () => {
  beforeEach(() => {
    setActivePinia(createAgentProviderSettingsPinia())
  })

  it('opens with the host snapshot, the fresh catalog and the tool list', async () => {
    const fetch = catalogFetch()
    const pair = await createHostClient({
      initialSettings: providerSettingsDocument(),
      fetch,
    })
    const store = useAgentProviderSettingsStore()
    store.bindAdmin(pair.client, pair.client)

    await store.show()

    expect(store.draft.baseUrl).toBe('https://provider.example.test/v1')
    expect(store.draft.name).toBe('Default')
    expect(store.snapshot?.activeProfileId).toBe('pf_main')
    expect(store.catalog?.models.map((model) => model.id)).toEqual(['fast', 'slow'])
    expect(store.tools.map((tool) => tool.name).sort()).toEqual(['ask_user', 'web_search'])
    expect(fetch).toHaveBeenCalledTimes(1)
    await pair.dispose()
  })

  it('adds, selects and removes pool models through commands only', async () => {
    const pair = await createHostClient({
      initialSettings: providerSettingsDocument(),
      fetch: catalogFetch(),
    })
    const store = useAgentProviderSettingsStore()
    store.bindAdmin(pair.client, pair.client)
    await store.show()

    expect(store.ready).toBe(false)
    await store.addModel({ id: 'fast', name: 'Fast', reasoningEfforts: ['low'] })
    await store.selectModel('fast')

    expect(store.models.map((model) => model.id)).toEqual(['fast'])
    expect(store.snapshot?.selectedModelId).toBe('fast')
    expect(store.ready).toBe(true)

    await store.removeModel('fast')
    expect(store.models).toEqual([])
    expect(store.snapshot?.selectedModelId).toBeNull()
    expect(store.ready).toBe(false)
    await pair.dispose()
  })

  it('keeps the model pool when the connection changes and refetches the catalog', async () => {
    const pair = await createHostClient({
      initialSettings: providerSettingsDocument({ models: [{ id: 'fast', name: 'Fast' }] }),
      fetch: catalogFetch(),
    })
    const store = useAgentProviderSettingsStore()
    store.bindAdmin(pair.client, pair.client)
    await store.show()
    const before = store.snapshot?.connectionRevision

    store.draft.baseUrl = 'https://other.example.test/v1'
    await expect(store.saveConnection()).resolves.toBe(true)

    expect(store.snapshot?.connectionRevision).toBe((before ?? 0) + 1)
    expect(store.models.map((model) => model.id)).toEqual(['fast'])
    expect(store.catalog?.connectionRevision).toBe(store.snapshot?.connectionRevision)
    await pair.dispose()
  })

  it('reports duplicate profile names inline instead of as a provider failure', async () => {
    const pair = await createHostClient({ initialSettings: providerSettingsDocument() })
    const store = useAgentProviderSettingsStore()
    store.bindAdmin(pair.client, pair.client)
    await store.show()

    await expect(store.createProfile('Second')).resolves.toBe(true)
    const second = store.profiles.find((profile) => profile.name === 'Second')
    if (!second) throw new Error('missing created profile')

    await expect(store.renameProfile(second.id, 'Default')).resolves.toBe(false)
    expect(store.profileNameError?.code).toBe('INVALID_PAYLOAD')
    expect(store.profiles.map((profile) => profile.name)).toEqual(['Default', 'Second'])
    expect(store.error).toBeNull()
    await pair.dispose()
  })

  it('surfaces a real error when the catalog cannot be read', async () => {
    const pair = await createHostClient({
      initialSettings: providerSettingsDocument(),
      fetch: vi.fn<typeof globalThis.fetch>(async () => new Response('', { status: 401 })),
    })
    const store = useAgentProviderSettingsStore()
    store.bindAdmin(pair.client, pair.client)

    await store.show()

    expect(store.error?.code).toBe('PROVIDER_AUTHENTICATION')
    expect(store.error?.message).not.toBe('The Provider operation failed.')
    expect(store.catalog).toBeNull()
    await pair.dispose()
  })
})
