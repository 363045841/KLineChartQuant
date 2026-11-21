// 宿主设置文档：v2 禁用集合、v1 迁移与旧版导入。
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
  it('starts from version 2 with an empty disabled list', () => {
    expect(parseAgentSettingsDocument(createEmptyAgentSettingsDocument())).toEqual({
      version: 2,
      profiles: [],
      modelPool: [],
      disabledTools: [],
    })
  })

  it('preserves the disabled list exactly', () => {
    const parsed = parseAgentSettingsDocument({
      version: 2,
      profiles: [],
      modelPool: [],
      disabledTools: ['code_interpreter', 'web_search'],
    })
    expect(parsed.disabledTools).toEqual(['code_interpreter', 'web_search'])
  })

  it('migrates version 1 to all enabled', () => {
    const parsed = parseAgentSettingsDocument({
      version: 1,
      profiles: [],
      modelPool: [],
      enabledTools: ['web_search'],
    })
    expect(parsed.version).toBe(2)
    expect(parsed.disabledTools).toEqual([])
  })

  it('rejects unsupported versions instead of guessing', () => {
    expect(() => parseAgentSettingsDocument({ version: 3 })).toThrow(AgentRuntimeError)
  })

  it('rejects malformed profile entries', () => {
    expect(() =>
      parseAgentSettingsDocument({
        version: 2,
        profiles: [{ name: 'main', apiKey: 'k', active: 'yes' }],
        modelPool: [],
        disabledTools: [],
      }),
    ).toThrow(AgentRuntimeError)
  })
})

describe('AgentSettingsStore', () => {
  it('starts from the empty document when nothing was stored', async () => {
    const store = new AgentSettingsStore(createMemoryStorage())
    await expect(store.read()).resolves.toEqual(createEmptyAgentSettingsDocument())
  })

  it('imports the legacy document exactly once and starts all tools enabled', async () => {
    const storage = createMemoryStorage()
    const store = new AgentSettingsStore(storage)
    const legacy = {
      profiles: [{ name: 'main', apiKey: 'sk-1', active: true }],
      modelPool: [],
      enabledTools: ['web_search'],
    }

    await store.importLegacy(legacy)
    await expect(store.read()).resolves.toMatchObject({
      version: 2,
      profiles: [{ name: 'main', apiKey: 'sk-1', active: true }],
      disabledTools: [],
    })
    await expect(store.importLegacy(legacy)).rejects.toMatchObject({ code: 'DUPLICATE_REQUEST' })
  })

  it('persists a disabled list and keeps it distinct from the empty default', async () => {
    const store = new AgentSettingsStore(createMemoryStorage())
    await store.replace({
      ...createEmptyAgentSettingsDocument(),
      disabledTools: ['code_interpreter'],
    })
    await expect(store.read()).resolves.toMatchObject({
      disabledTools: ['code_interpreter'],
    })
  })
})
