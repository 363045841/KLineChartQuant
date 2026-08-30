import type { ProviderApiProtocol } from '../contracts/ui.js'

export const OPENAI_COMPATIBLE_PROVIDER_ID = 'openai-compatible'
export const OPENAI_COMPATIBLE_PROVIDER_LABEL = 'OpenAI-compatible'
export const PROVIDER_SETTINGS_VERSION = 2 as const

export interface ProviderCredentialStore {
  read(signal?: AbortSignal): Promise<string | undefined>
  write(apiKey: string, signal?: AbortSignal): Promise<void>
  delete(signal?: AbortSignal): Promise<void>
}

export interface OpenAiCompatibleProviderSettings {
  version: typeof PROVIDER_SETTINGS_VERSION
  baseUrl: string
  modelId: string
  modelName: string
  protocol: ProviderApiProtocol
  compatibility: 'compatible'
  lastTestedAt: number
  lastModelsRefreshAt: number
}

export interface ProviderSettingsStore {
  read(signal?: AbortSignal): Promise<OpenAiCompatibleProviderSettings | undefined>
  write(settings: OpenAiCompatibleProviderSettings, signal?: AbortSignal): Promise<void>
}

export interface ProviderDiagnostic {
  phase: 'request' | 'response' | 'retry' | 'failure' | 'validation'
  method: string
  url: string
  attempt: number
  status?: number
  contentType?: string
  durationMs?: number
  code?: string
  stage?: 'catalog' | 'text' | 'tool' | 'stream'
  responseBodyBytes?: number
  responseBodyShape?: 'empty' | 'json-like' | 'sse' | 'html' | 'other'
}

export interface OpenAiCompatibleRuntimeOptions {
  credentials: ProviderCredentialStore
  settings: ProviderSettingsStore
  fetch?: typeof globalThis.fetch
  now?: () => number
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>
  requestTimeoutMs?: number
  maxRetries?: number
  maxRetryDelayMs?: number
  diagnostics?: (diagnostic: ProviderDiagnostic) => void
  tools?: (context: {
    readonly sessionId: string
    readonly runId: string
    readonly turnId: string
    readonly prompt: string
    readonly readOnly: boolean
  }) => readonly import('../pi/types.js').RuntimeToolDefinition[]
}
