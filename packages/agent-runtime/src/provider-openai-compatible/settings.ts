import { AgentRuntimeError } from '../contracts/errors.js'

import {
  PROVIDER_SETTINGS_VERSION,
  type OpenAiCompatibleProviderSettings,
  type ProviderCredentialStore,
  type ProviderSettingsStore,
} from './types.js'

import type { ProviderApiProtocol } from '../contracts/ui.js'

const LEGACY_PROVIDER_SETTINGS_VERSION = 1 as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseOpenAiCompatibleProviderSettings(
  value: unknown,
): OpenAiCompatibleProviderSettings | undefined {
  if (value === undefined) return undefined
  const protocol = providerProtocolFromSettings(value)
  if (
    !isRecord(value) ||
    (value.version !== PROVIDER_SETTINGS_VERSION &&
      value.version !== LEGACY_PROVIDER_SETTINGS_VERSION) ||
    typeof value.baseUrl !== 'string' ||
    typeof value.modelId !== 'string' ||
    typeof value.modelName !== 'string' ||
    value.compatibility !== 'compatible' ||
    typeof value.lastTestedAt !== 'number' ||
    !Number.isFinite(value.lastTestedAt) ||
    typeof value.lastModelsRefreshAt !== 'number' ||
    !Number.isFinite(value.lastModelsRefreshAt) ||
    !protocol
  ) {
    throw new AgentRuntimeError('PROVIDER_ERROR', 'The saved Provider settings are invalid.', {
      recommendedAction: 'Test the Provider connection again.',
    })
  }
  return {
    version: PROVIDER_SETTINGS_VERSION,
    baseUrl: value.baseUrl,
    modelId: value.modelId,
    modelName: value.modelName,
    protocol,
    compatibility: value.compatibility,
    lastTestedAt: value.lastTestedAt,
    lastModelsRefreshAt: value.lastModelsRefreshAt,
  }
}

// v1 只有 Chat Completions；读取时原位升级为显式协议，避免旧配置失效。
function providerProtocolFromSettings(value: unknown): ProviderApiProtocol | undefined {
  if (!isRecord(value)) return undefined
  if (value.version === LEGACY_PROVIDER_SETTINGS_VERSION) return 'openai-completions'
  if (value.protocol === 'openai-completions' || value.protocol === 'openai-responses') {
    return value.protocol
  }
  return undefined
}

export class InMemoryProviderCredentialStore implements ProviderCredentialStore {
  private key: string | undefined

  async read(signal?: AbortSignal): Promise<string | undefined> {
    signal?.throwIfAborted()
    return this.key
  }

  async write(apiKey: string, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    this.key = apiKey
  }

  async delete(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    this.key = undefined
  }
}

export class InMemoryProviderSettingsStore implements ProviderSettingsStore {
  private value: OpenAiCompatibleProviderSettings | undefined

  async read(signal?: AbortSignal): Promise<OpenAiCompatibleProviderSettings | undefined> {
    signal?.throwIfAborted()
    return this.value ? structuredClone(this.value) : undefined
  }

  async write(settings: OpenAiCompatibleProviderSettings, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    this.value = structuredClone(settings)
  }
}
