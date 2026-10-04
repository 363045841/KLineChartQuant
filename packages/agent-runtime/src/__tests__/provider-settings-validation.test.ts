import { describe, expect, it } from 'vitest'

import {
  AgentRuntimeError,
  InMemoryProviderCredentialStore,
  InMemoryProviderSettingsStore,
  PROVIDER_SETTINGS_VERSION,
  parseOpenAiCompatibleProviderSettings,
  type OpenAiCompatibleProviderSettings,
} from '../index'

/** 一份合法的持久化设置，逐字段做变异以覆盖校验分支。 */
function validSettings(): Record<string, unknown> {
  return {
    version: PROVIDER_SETTINGS_VERSION,
    baseUrl: 'https://models.example.test/v1',
    headers: { 'x-tenant': 'alpha' },
    modelId: 'model-a',
    modelName: 'Model A',
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    reasoningEfforts: ['high', 'low'],
    reasoningEffort: 'low',
    protocol: 'openai-completions',
    compatibility: 'compatible',
    lastTestedAt: 1_700_000_000_000,
    lastModelsRefreshAt: 1_700_000_001_000,
  }
}

function parseWith(mutate: (value: Record<string, unknown>) => void): () => unknown {
  const value = validSettings()
  mutate(value)
  return () => parseOpenAiCompatibleProviderSettings(value)
}

describe('parseOpenAiCompatibleProviderSettings', () => {
  it('returns undefined when nothing has been persisted', () => {
    expect(parseOpenAiCompatibleProviderSettings(undefined)).toBeUndefined()
  })

  it('normalizes a valid record and copies headers defensively', () => {
    const raw = validSettings()
    const parsed = parseOpenAiCompatibleProviderSettings(raw)
    expect(parsed).toEqual({
      version: PROVIDER_SETTINGS_VERSION,
      baseUrl: 'https://models.example.test/v1',
      headers: { 'x-tenant': 'alpha' },
      modelId: 'model-a',
      modelName: 'Model A',
      contextWindow: 128_000,
      maxOutputTokens: 4_096,
      reasoningEfforts: ['high', 'low'],
      reasoningEffort: 'low',
      protocol: 'openai-completions',
      compatibility: 'compatible',
      lastTestedAt: 1_700_000_000_000,
      lastModelsRefreshAt: 1_700_000_001_000,
    })
    expect(parsed?.headers).not.toBe(raw.headers)
    expect(parsed?.reasoningEfforts).not.toBe(raw.reasoningEfforts)
  })

  it('defaults headers to an empty object when absent', () => {
    const parsed = parseOpenAiCompatibleProviderSettings(
      (() => {
        const value = validSettings()
        delete value.headers
        return value
      })(),
    )
    expect(parsed?.headers).toEqual({})
  })

  it('accepts a record without contextWindow and omits the key entirely', () => {
    const value = validSettings()
    delete value.contextWindow
    const parsed = parseOpenAiCompatibleProviderSettings(value)
    expect(parsed).toBeDefined()
    expect('contextWindow' in (parsed as object)).toBe(false)
  })

  it('accepts openai-responses as a protocol', () => {
    const value = validSettings()
    value.protocol = 'openai-responses'
    expect(parseOpenAiCompatibleProviderSettings(value)?.protocol).toBe('openai-responses')
  })

  it('accepts an absent reasoningEffort with a non-empty reasoningEfforts list', () => {
    const value = validSettings()
    delete value.reasoningEffort
    const parsed = parseOpenAiCompatibleProviderSettings(value)
    expect(parsed?.reasoningEffort).toBeUndefined()
    expect(parsed?.reasoningEfforts).toEqual(['high', 'low'])
  })

  const rejections: ReadonlyArray<readonly [string, (value: Record<string, unknown>) => void]> = [
    ['a stale schema version', (value) => void (value.version = PROVIDER_SETTINGS_VERSION - 1)],
    ['a non-string baseUrl', (value) => void (value.baseUrl = 42)],
    ['a non-string modelId', (value) => void (value.modelId = null)],
    ['a non-string modelName', (value) => void (value.modelName = { label: 'x' })],
    ['a non-number contextWindow', (value) => void (value.contextWindow = '128000')],
    ['a fractional contextWindow', (value) => void (value.contextWindow = 1.5)],
    ['a zero contextWindow', (value) => void (value.contextWindow = 0)],
    ['a missing maxOutputTokens', (value) => void delete value.maxOutputTokens],
    ['a fractional maxOutputTokens', (value) => void (value.maxOutputTokens = 4096.5)],
    ['a negative maxOutputTokens', (value) => void (value.maxOutputTokens = -1)],
    ['a non-array reasoningEfforts', (value) => void (value.reasoningEfforts = 'high')],
    ['an unknown reasoning effort', (value) => void (value.reasoningEfforts = ['extreme'])],
    ['an unknown selected reasoningEffort', (value) => void (value.reasoningEffort = 'extreme')],
    [
      'a selected reasoningEffort outside the supported list',
      (value) => void (value.reasoningEffort = 'medium'),
    ],
    ['a non-compatible compatibility marker', (value) => void (value.compatibility = 'unknown')],
    ['a non-number lastTestedAt', (value) => void (value.lastTestedAt = '2024')],
    ['a non-finite lastTestedAt', (value) => void (value.lastTestedAt = Number.NaN)],
    ['a missing lastModelsRefreshAt', (value) => void delete value.lastModelsRefreshAt],
    ['a non-finite lastModelsRefreshAt', (value) => void (value.lastModelsRefreshAt = Infinity)],
    ['an unknown protocol', (value) => void (value.protocol = 'anthropic-messages')],
    ['a missing protocol', (value) => void delete value.protocol],
    ['a non-object headers value', (value) => void (value.headers = ['x-tenant'])],
    ['a non-string header value', (value) => void (value.headers = { 'x-tenant': 7 })],
  ]

  for (const [label, mutate] of rejections) {
    it(`rejects ${label}`, () => {
      const run = parseWith(mutate)
      expect(run).toThrow(AgentRuntimeError)
      try {
        run()
        expect.unreachable('expected the parser to reject the mutated settings')
      } catch (error) {
        expect((error as AgentRuntimeError).code).toBe('PROVIDER_ERROR')
        expect((error as AgentRuntimeError).recommendedAction).toBe(
          'Test the Provider connection again.',
        )
      }
    })
  }

  it('rejects primitives and arrays that are not settings records', () => {
    for (const value of ['settings', 7, null, true, [validSettings()]]) {
      expect(() => parseOpenAiCompatibleProviderSettings(value)).toThrow(AgentRuntimeError)
    }
  })
})

describe('InMemoryProviderCredentialStore', () => {
  it('reads back what it wrote and clears on delete', async () => {
    const store = new InMemoryProviderCredentialStore()
    expect(await store.read()).toBeUndefined()
    await store.write('temporary-provider-credential')
    expect(await store.read()).toBe('temporary-provider-credential')
    await store.delete()
    expect(await store.read()).toBeUndefined()
  })

  it('honours an aborted signal on every operation', async () => {
    const store = new InMemoryProviderCredentialStore()
    const aborted = AbortSignal.abort(new Error('cancelled by host'))
    await expect(store.read(aborted)).rejects.toThrow('cancelled by host')
    await expect(store.write('k', aborted)).rejects.toThrow('cancelled by host')
    await expect(store.delete(aborted)).rejects.toThrow('cancelled by host')
  })
})

describe('InMemoryProviderSettingsStore', () => {
  const settings = parseOpenAiCompatibleProviderSettings(
    validSettings(),
  ) as OpenAiCompatibleProviderSettings

  it('isolates the caller from the stored value on both read and write', async () => {
    const store = new InMemoryProviderSettingsStore()
    expect(await store.read()).toBeUndefined()
    const written = { ...settings, headers: { ...settings.headers } }
    await store.write(written)
    written.headers['x-tenant'] = 'mutated-after-write'
    const first = await store.read()
    expect(first?.headers).toEqual({ 'x-tenant': 'alpha' })
    first!.modelId = 'mutated-after-read'
    expect((await store.read())?.modelId).toBe('model-a')
  })

  it('honours an aborted signal on read and write', async () => {
    const store = new InMemoryProviderSettingsStore()
    const aborted = AbortSignal.abort(new Error('cancelled by host'))
    await expect(store.read(aborted)).rejects.toThrow('cancelled by host')
    await expect(store.write(settings, aborted)).rejects.toThrow('cancelled by host')
  })
})
