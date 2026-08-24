import { AgentRuntimeError } from '../contracts/errors.js'

import {
  PROVIDER_SETTINGS_VERSION,
  type OpenAiCompatibleProviderSettings,
  type ProviderCredentialMetadata,
  type ProviderCredentialStore,
  type ProviderSettingsStore,
} from './types.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseOpenAiCompatibleProviderSettings(
  value: unknown,
): OpenAiCompatibleProviderSettings | undefined {
  if (value === undefined) return undefined
  if (
    !isRecord(value) ||
    value.version !== PROVIDER_SETTINGS_VERSION ||
    typeof value.baseUrl !== 'string' ||
    typeof value.modelId !== 'string' ||
    typeof value.modelName !== 'string' ||
    value.compatibility !== 'compatible' ||
    typeof value.lastTestedAt !== 'number' ||
    !Number.isFinite(value.lastTestedAt) ||
    typeof value.lastModelsRefreshAt !== 'number' ||
    !Number.isFinite(value.lastModelsRefreshAt)
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
    compatibility: value.compatibility,
    lastTestedAt: value.lastTestedAt,
    lastModelsRefreshAt: value.lastModelsRefreshAt,
  }
}

export class InMemoryProviderCredentialStore implements ProviderCredentialStore {
  private key: string | undefined

  constructor(
    private readonly credentialMetadata: ProviderCredentialMetadata = {
      persistenceMode: 'memory-only',
    },
  ) {}

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

  async metadata(): Promise<ProviderCredentialMetadata> {
    return { ...this.credentialMetadata }
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
