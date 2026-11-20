// 宿主设置文档：解析、单次迁移与工具启用集合的语义。
import { describe, expect, it } from 'vitest'
import { AgentRuntimeError } from '../contracts/errors.js'
import {
  type AgentSettingsStorage,
  AgentSettingsStore,
  createEmptyAgentSettingsDocument,
  parseAgentSettingsDocument,
} from '../host/impl/agent-settings.js'

/** 内存设置存储；读不到时返回 null，与 IndexedDB 实现一致。 */
function createMemoryStorage(initial: unknown = null): AgentSettingsStorage {
  let value = initial
  return {
    async read() {
      return value
    },
    async write(document) {
      value = document
    },
  }
}

describe('parseAgentSettingsDocument', () => {
  it('accepts the current version and preserves null enabledTools', () => {
    const parsed = parseAgentSettingsDocument(createEmptyAgentSettingsDocument())
    expect(parsed).toEqual({ version: 1, profiles: [], modelPool: [], enabledTools: null })
  })

  it('rejects unsupported versions instead of guessing', () => {
    expect(() => parseAgentSettingsDocument({ version: 2 })).toThrow(AgentRuntimeError)
  })

  it('rejects malformed profile entries', () => {
    expect(() =>
      parseAgentSettingsDocument({
        version: 1,
        profiles: [{ name: 'main', apiKey: 'k', active: 'yes' }],
        modelPool: [],
        enabledTools: null,
      }),
    ).toThrow(AgentRuntimeError)
  })
})

describe('AgentSettingsStore', () => {
  it('starts from the empty document when nothing was stored', async () => {
    const store = new AgentSettingsStore(createMemoryStorage())
    await expect(store.read()).resolves.toEqual(createEmptyAgentSettingsDocument())
  })

  it('imports the legacy document exactly once', async () => {
    const storage = createMemoryStorage()
    const store = new AgentSettingsStore(storage)
    const legacy = {
      profiles: [{ name: 'main', apiKey: 'sk-1', active: true }],
      modelPool: [],
      enabledTools: ['web_search'],
    }

    await store.importLegacy(legacy)
    await expect(store.read()).resolves.toMatchObject({
      profiles: [{ name: 'main', apiKey: 'sk-1', active: true }],
      enabledTools: ['web_search'],
    })
    await expect(store.importLegacy(legacy)).rejects.toMatchObject({ code: 'DUPLICATE_REQUEST' })
  })

  it('keeps an empty enabled list distinct from the never-configured state', async () => {
    const storage = createMemoryStorage()
    const store = new AgentSettingsStore(storage)
    await store.replace({ ...createEmptyAgentSettingsDocument(), enabledTools: [] })
    await expect(store.read()).resolves.toMatchObject({ enabledTools: [] })
  })
})
