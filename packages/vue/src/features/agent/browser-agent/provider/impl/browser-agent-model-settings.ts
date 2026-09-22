// Agent 模型设置的唯一持久化实现：profiles、modelPool、enabledTools 共享一次 LocalStorage 写入。

import type { ProviderModelPoolEntry } from '@363045841yyt/klinechart-agent-runtime'
import { createLocalStoragePersistence, type PersistenceCodec } from '@363045841yyt/klinechart-core'
import type { BrowserAgentModelSettings, BrowserProviderProfile } from '../types.js'

/** LocalStorage 中 Agent 模型设置的键名；测试据此断言持久化文档。 */
export const AGENT_MODEL_SETTINGS_STORAGE_KEY = 'agent.model-settings'

/** 校验持久化 JSON 是否具备完整的设置文档外形。 */
function isBrowserAgentModelSettings(value: unknown): value is BrowserAgentModelSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return (
    Array.isArray(Object.getOwnPropertyDescriptor(value, 'profiles')?.value) &&
    Array.isArray(Object.getOwnPropertyDescriptor(value, 'modelPool')?.value) &&
    Array.isArray(Object.getOwnPropertyDescriptor(value, 'enabledTools')?.value)
  )
}

const browserAgentModelSettingsCodec: PersistenceCodec<BrowserAgentModelSettings> = {
  decode(value): BrowserAgentModelSettings | null {
    return isBrowserAgentModelSettings(value) ? value : null
  },
  encode(value): unknown {
    return value
  },
}

/** Agent 模型设置的唯一持久化入口。 */
const browserAgentModelSettingsPersistence = createLocalStoragePersistence({
  key: AGENT_MODEL_SETTINGS_STORAGE_KEY,
  codec: browserAgentModelSettingsCodec,
})

/** 管理 Agent 模型设置文档，领域集合共享一次持久化写入。 */
export class BrowserAgentModelSettingsStore {
  private cache = browserAgentModelSettingsPersistence.load() ?? {
    profiles: [],
    modelPool: [],
    enabledTools: [],
  }

  profiles(): BrowserProviderProfile[] {
    return this.cache.profiles.map((profile) => ({ ...profile }))
  }

  modelPool(): ProviderModelPoolEntry[] {
    return [...this.cache.modelPool]
  }

  enabledTools(): string[] {
    return [...this.cache.enabledTools]
  }

  setProfiles(profiles: BrowserProviderProfile[]): void {
    this.cache = { ...this.cache, profiles: profiles.map((profile) => ({ ...profile })) }
    this.persist()
  }

  setModelPool(modelPool: readonly ProviderModelPoolEntry[]): void {
    this.cache = { ...this.cache, modelPool: [...modelPool] }
    this.persist()
  }

  setEnabledTools(enabledTools: ReadonlySet<string>): void {
    this.cache = { ...this.cache, enabledTools: [...enabledTools] }
    this.persist()
  }

  /** 把内存文档写回 LocalStorage。 */
  private persist(): void {
    browserAgentModelSettingsPersistence.save(this.cache)
  }
}
