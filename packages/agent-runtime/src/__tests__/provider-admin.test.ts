// Provider 管理 API：文档迁移、快照投影、命令行为、目录读取与错误语义。
import { describe, expect, it, vi } from 'vitest'
import {
  createEmptyAgentSettingsDocument,
  parseAgentSettingsDocument,
  projectProviderSettings,
} from '../host/impl/agent-settings.js'
import { createHostClient, providerSettingsDocument } from '../testing/host-client.js'

const baseUrl = 'https://provider.example.test/v1'

/** 固定 id 的迁移函数，便于断言生成的配置标识。 */
function fixedId(): string {
  return 'pf_generated'
}

/** 构造只响应 `/models` 的 Provider fetch。 */
function catalogFetch(models: Array<{ id: string; name: string }>) {
  return vi.fn<typeof globalThis.fetch>(async (input) => {
    if (String(input).endsWith('/models')) {
      return new Response(JSON.stringify({ object: 'list', data: models }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('', { status: 404 })
  })
}

describe('Agent settings document', () => {
  it('starts empty at the current version', () => {
    expect(parseAgentSettingsDocument(createEmptyAgentSettingsDocument())).toEqual({
      version: 3,
      revision: 0,
      profiles: [],
      disabledTools: [],
    })
  })

  it('rejects unsupported versions and malformed entries', () => {
    expect(() => parseAgentSettingsDocument({ version: 9 })).toThrowError(
      expect.objectContaining({ code: 'INVALID_PAYLOAD' }),
    )
    expect(() =>
      parseAgentSettingsDocument({
        version: 3,
        revision: 0,
        profiles: [{ id: 'pf', name: 'main', apiKey: 'k', active: 'yes' }],
        disabledTools: [],
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_PAYLOAD' }))
  })

  it('migrates version 2 into nested pools and projectable settings', () => {
    const parsed = parseAgentSettingsDocument(
      {
        version: 2,
        profiles: [
          {
            name: 'main',
            apiKey: 'sk-1',
            active: true,
            connection: { baseUrl, headers: {}, protocol: 'openai-responses' },
            settings: {
              version: 4,
              baseUrl,
              headers: {},
              modelId: 'fast',
              modelName: 'Fast',
              maxOutputTokens: 8_192,
              reasoningEfforts: ['low'],
              reasoningEffort: 'low',
              protocol: 'openai-responses',
            },
          },
        ],
        modelPool: [
          {
            provider: 'main',
            id: 'fast',
            name: 'Fast',
            contextWindow: 32_768,
            maxOutputTokens: 8_192,
            reasoningEfforts: ['low'],
          },
        ],
        disabledTools: ['web_search'],
      },
      fixedId,
    )

    expect(parsed.version).toBe(3)
    expect(parsed.profiles[0]).toMatchObject({
      id: 'pf_generated',
      name: 'main',
      selectedModelId: 'fast',
      reasoningEffort: 'low',
      models: [{ id: 'fast', name: 'Fast', maxOutputTokens: 8_192 }],
    })
    expect(parsed.disabledTools).toEqual(['web_search'])
    expect(projectProviderSettings(parsed)).toMatchObject({
      baseUrl,
      modelId: 'fast',
      modelName: 'Fast',
      reasoningEffort: 'low',
    })
  })

  it('treats a selection that is no longer in the pool as unconfigured', () => {
    const parsed = parseAgentSettingsDocument(
      {
        version: 3,
        revision: 1,
        profiles: [
          {
            id: 'pf',
            name: 'main',
            apiKey: 'k',
            active: true,
            connectionRevision: 1,
            connection: { baseUrl, headers: {}, protocol: 'openai-responses' },
            models: [],
            selectedModelId: 'gone',
          },
        ],
        disabledTools: [],
      },
      fixedId,
    )
    expect(projectProviderSettings(parsed)).toBeUndefined()
  })
})

describe('ProviderAdmin commands', () => {
  it('writes a versioned snapshot and bumps the document revision once', async () => {
    const pair = await createHostClient()
    const empty = await pair.client.snapshot()
    expect(empty).toMatchObject({ revision: 0, profiles: [], activeProfileId: null })

    const created = await pair.client.createProfile('Main')
    expect(created.revision).toBe(1)
    expect(created.profiles).toEqual([
      { id: expect.stringMatching(/^pf_/), name: 'Main', active: true },
    ])
    await expect(pair.client.createProfile('Main')).rejects.toMatchObject({
      code: 'INVALID_PAYLOAD',
    })
    await pair.dispose()
  })

  it('keeps the model pool when the connection changes and bumps connectionRevision', async () => {
    const pair = await createHostClient({
      initialSettings: providerSettingsDocument({ models: [{ id: 'fast', name: 'Fast' }] }),
    })
    const before = await pair.client.snapshot()
    const saved = await pair.client.saveConnection({
      profileId: 'pf_main',
      baseUrl: 'https://other.example.test/v1',
      headers: {},
      protocol: 'openai-completions',
    })
    expect(saved.connectionRevision).toBe(before.connectionRevision + 1)
    expect(saved.models.map((model) => model.id)).toEqual(['fast'])

    const unchanged = await pair.client.saveConnection({
      profileId: 'pf_main',
      baseUrl: 'https://other.example.test/v1',
      headers: {},
      protocol: 'openai-completions',
      apiKey: 'next-key',
    })
    expect(unchanged.connectionRevision).toBe(saved.connectionRevision)
    expect(unchanged.credentialPresent).toBe(true)
    await pair.dispose()
  })

  it('adds, selects and removes pool models with explicit errors', async () => {
    const pair = await createHostClient()
    await pair.client.createProfile('Main')
    const profileId = (await pair.client.snapshot()).activeProfileId
    if (!profileId) throw new Error('missing profile')

    await expect(pair.client.selectModel(profileId, 'fast')).rejects.toMatchObject({
      code: 'PROVIDER_MODEL_NOT_FOUND',
    })

    await pair.client.addModel(profileId, {
      id: 'fast',
      name: 'Fast',
      maxOutputTokens: 8_192,
      reasoningEfforts: ['low', 'none'],
      defaultReasoningEffort: 'low',
    })
    const selected = await pair.client.selectModel(profileId, 'fast')
    expect(selected.selectedModelId).toBe('fast')
    expect(selected.reasoningEffort).toBe('low')

    await expect(pair.client.setReasoningEffort(profileId, 'high')).rejects.toMatchObject({
      code: 'INVALID_PAYLOAD',
    })
    const effort = await pair.client.setReasoningEffort(profileId, 'none')
    expect(effort.reasoningEffort).toBe('none')

    const removed = await pair.client.removeModel(profileId, 'fast')
    expect(removed.models).toEqual([])
    expect(removed.selectedModelId).toBeNull()
    expect(removed.reasoningEffort).toBeUndefined()
    await pair.dispose()
  })

  it('deletes a profile with its credential and models, keeping one active profile', async () => {
    const pair = await createHostClient()
    await pair.client.createProfile('First')
    await pair.client.createProfile('Second')

    const first = (await pair.client.snapshot()).profiles[0]
    const deleted = await pair.client.deleteProfile(first.id)
    expect(deleted.profiles).toHaveLength(1)
    expect(deleted.profiles[0].active).toBe(true)
    expect(deleted.activeProfileId).toBe(deleted.profiles[0].id)
    await pair.dispose()
  })

  it('reads the catalog on every call instead of caching it', async () => {
    const fetch = catalogFetch([{ id: 'fast', name: 'Fast' }])
    const pair = await createHostClient({
      initialSettings: providerSettingsDocument(),
      fetch,
    })

    const first = await pair.client.refreshCatalog('pf_main')
    const second = await pair.client.refreshCatalog('pf_main')
    expect(first.models.map((model) => model.id)).toEqual(['fast'])
    expect(second.models.map((model) => model.id)).toEqual(['fast'])
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(first.connectionRevision).toBe(1)
    await pair.dispose()
  })

  it('stores the Exa key and never exposes it in the snapshot', async () => {
    const pair = await createHostClient()
    const saved = await pair.client.saveExaKey('  exa-secret  ')
    expect(saved.exaConfigured).toBe(true)
    expect(JSON.stringify(saved)).not.toContain('exa-secret')

    const cleared = await pair.client.saveExaKey('')
    expect(cleared.exaConfigured).toBe(false)
    await pair.dispose()
  })

  it('keeps revisions monotonic across writes', async () => {
    const pair = await createHostClient({ initialSettings: providerSettingsDocument() })
    const first = await pair.client.saveExaKey('a')
    const second = await pair.client.saveExaKey('b')
    expect(second.revision).toBe(first.revision + 1)
    const snapshotted = await pair.client.snapshot()
    expect(snapshotted.revision).toBe(second.revision)
    await pair.dispose()
  })
})
