// 验证 Provider 连接持久化与模型目录刷新保持独立。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia } from 'pinia'

import {
  createAgentProviderSettingsPinia,
  useAgentProviderSettingsStore,
} from '../agent-provider-settings-store'
import { FakeAgentBridge } from '../testing/fake-agent-bridge'

describe('AgentProviderSettingsStore', () => {
  beforeEach(() => {
    setActivePinia(createAgentProviderSettingsPinia())
  })

  it('keeps connection persistence separate from model catalog refresh', async () => {
    const bridge = new FakeAgentBridge({ providerConfigured: true })
    const listCatalog = vi.spyOn(bridge, 'listProviderModelCatalog').mockResolvedValue({
      models: [],
      refreshedAt: 0,
    })
    const store = useAgentProviderSettingsStore()
    store.bindBridge(bridge)

    await store.show(await bridge.getProviderStatus())
    expect(listCatalog).not.toHaveBeenCalled()

    store.baseUrl = 'https://models.example.test/v1'
    await store.persistConnection()
    expect(listCatalog).not.toHaveBeenCalled()

    await store.refreshModelCatalog()
    expect(listCatalog).toHaveBeenCalledTimes(1)
  })

  it('adds and removes a catalog model through its pool membership switch', async () => {
    const bridge = new FakeAgentBridge()
    await bridge.createProviderProfile('Provider A')
    await bridge.selectProviderProfile('Provider A')
    const store = useAgentProviderSettingsStore()
    store.bindBridge(bridge)
    await store.show(await bridge.getProviderStatus())
    store.modelCatalog = [{ id: 'provider-model-a', name: 'Provider Model A', compatibility: 'compatible' }]

    await store.setModelPoolMembership('provider-model-a', true)
    expect(store.modelPool.map((model) => model.id)).toEqual(['provider-model-a'])

    await store.setModelPoolMembership('provider-model-a', false)
    expect(store.modelPool).toEqual([])
  })
})
