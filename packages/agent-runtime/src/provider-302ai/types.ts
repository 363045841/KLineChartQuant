import type { ProviderPersistenceMode } from '../contracts/ui.js'

export const PROVIDER_302AI_ID = '302ai'
export const PROVIDER_302AI_LABEL = '302.ai'
export const DEFAULT_302AI_BASE_URL = 'https://api.302.ai/v1'
export const PROVIDER_SETTINGS_VERSION = 1 as const

export interface ProviderCredentialMetadata {
  persistenceMode: ProviderPersistenceMode
  warning?: string
}

export interface ProviderCredentialStore {
  read(signal?: AbortSignal): Promise<string | undefined>
  write(apiKey: string, signal?: AbortSignal): Promise<void>
  delete(signal?: AbortSignal): Promise<void>
  metadata(): Promise<ProviderCredentialMetadata>
}

export interface Provider302AiSettings {
  version: typeof PROVIDER_SETTINGS_VERSION
  baseUrl: string
  modelId: string
  modelName: string
  compatibility: 'compatible'
  lastTestedAt: number
  lastModelsRefreshAt: number
}

export interface ProviderSettingsStore {
  read(signal?: AbortSignal): Promise<Provider302AiSettings | undefined>
  write(settings: Provider302AiSettings, signal?: AbortSignal): Promise<void>
}

export interface Provider302AiRuntimeOptions {
  credentials: ProviderCredentialStore
  settings: ProviderSettingsStore
  fetch?: typeof globalThis.fetch
  now?: () => number
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>
  requestTimeoutMs?: number
  maxRetries?: number
  maxRetryDelayMs?: number
}
