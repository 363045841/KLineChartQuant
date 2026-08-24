import { createModels, createProvider } from '@earendil-works/pi-ai'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'

import { AgentRuntimeError, toAgentRuntimeError } from '../contracts/errors.js'

import {
  normalizeProviderBaseUrl,
  parseRetryAfter,
  providerHttpError,
  redactProviderUrl,
  requestProviderJson,
  sleepWithSignal,
} from './http.js'
import {
  OPENAI_COMPATIBLE_PROVIDER_ID,
  OPENAI_COMPATIBLE_PROVIDER_LABEL,
  PROVIDER_SETTINGS_VERSION,
} from './types.js'

import type {
  OpenAiCompatibleRuntimeOptions,
  OpenAiCompatibleProviderSettings,
  ProviderDiagnostic,
} from './types.js'
import type { RuntimeSupport } from '../application/unavailable-runtime.js'
import type { AgentRuntimeErrorCode } from '../contracts/errors.js'
import type {
  ProviderModelView,
  ProviderModelsInput,
  ProviderModelsResult,
  ProviderProbeStageResult,
  ProviderStatusView,
  ProviderTestInput,
  ProviderTestResult,
} from '../contracts/ui.js'
import type { PiRunPlan } from '../pi/types.js'
import type { AssistantMessage, FetchFunction, Model } from '@earendil-works/pi-ai'

const MAX_CATALOG_MODELS = 2_000
const MAX_MODEL_ID_LENGTH = 256
const DEFAULT_CONTEXT_WINDOW = 32_768
const DEFAULT_MAX_TOKENS = 4_096

interface CatalogModel {
  id: string
  name: string
}

interface StreamObservation {
  status?: number
  retryAfterMs?: number
  networkFailure: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseCatalog(value: unknown): CatalogModel[] {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    throw malformed('The Provider returned an invalid model catalog.')
  }
  const unique = new Map<string, CatalogModel>()
  for (const item of value.data) {
    if (!isRecord(item) || typeof item.id !== 'string') continue
    const id = item.id.trim()
    if (!id || id.length > MAX_MODEL_ID_LENGTH) continue
    const rawName = typeof item.name === 'string' ? item.name.trim() : ''
    unique.set(id, { id, name: rawName.slice(0, MAX_MODEL_ID_LENGTH) || id })
    if (unique.size >= MAX_CATALOG_MODELS) break
  }
  if (unique.size === 0) throw malformed('The Provider returned an empty model catalog.')
  return [...unique.values()].sort((left, right) => left.id.localeCompare(right.id))
}

function malformed(message = 'The Provider returned a malformed response.'): AgentRuntimeError {
  return new AgentRuntimeError('PROVIDER_MALFORMED_RESPONSE', message, {
    retryable: true,
    recommendedAction: 'Retry the request or select another model.',
  })
}

function safeProviderError(error: unknown): AgentRuntimeError {
  if (error instanceof AgentRuntimeError) return error
  return new AgentRuntimeError('PROVIDER_ERROR', 'The Provider operation failed.', {
    retryable: true,
    recommendedAction: 'Retry the operation or test the Provider connection.',
    cause: error,
  })
}

function elapsed(now: () => number, startedAt: number): number {
  return Math.max(0, now() - startedAt)
}

async function fingerprint(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return `sha256:${[...new Uint8Array(digest)]
    .slice(0, 6)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`
}

function modelFromCatalog(baseUrl: string, model: CatalogModel): Model<'openai-completions'> {
  return {
    id: model.id,
    name: model.name,
    api: 'openai-completions',
    provider: OPENAI_COMPATIBLE_PROVIDER_ID,
    baseUrl,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: DEFAULT_MAX_TOKENS,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      supportsUsageInStreaming: false,
      maxTokensField: 'max_tokens',
    },
  }
}

function streamError(
  code: AgentRuntimeErrorCode,
  message: string,
  retryable: boolean,
  recommendedAction: string,
): AgentRuntimeError {
  return new AgentRuntimeError(code, message, { retryable, recommendedAction })
}

function classifyStreamError(
  message: AssistantMessage,
  observation: StreamObservation,
): AgentRuntimeError {
  if (observation.status && observation.status >= 400) {
    return providerHttpError(observation.status, observation.retryAfterMs)
  }
  const category = message.errorMessage ?? ''
  if (/timeout|timed out|deadline/i.test(category)) {
    return streamError(
      'PROVIDER_TIMEOUT',
      'The Provider request timed out.',
      true,
      'Retry the request or use a faster model.',
    )
  }
  if (/json|parse|sse|stream ended|unexpected end|invalid.*response/i.test(category)) {
    return malformed()
  }
  if (observation.networkFailure) {
    return streamError(
      'PROVIDER_UNAVAILABLE',
      'The app could not reach the Provider.',
      true,
      'Check the network connection and retry.',
    )
  }
  return streamError(
    'PROVIDER_ERROR',
    'The Provider request failed.',
    true,
    'Retry the request or select another model.',
  )
}

export function createOpenAiCompatibleRuntimeSupport(
  options: OpenAiCompatibleRuntimeOptions,
): RuntimeSupport {
  const fetchImplementation = options.fetch ?? globalThis.fetch
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? sleepWithSignal
  const timeoutMs = options.requestTimeoutMs ?? 30_000
  const maxRetries = options.maxRetries ?? 2
  const maxRetryDelayMs = options.maxRetryDelayMs ?? 60_000
  let catalog: CatalogModel[] = []
  let lastError: AgentRuntimeError | undefined
  let lastRefreshAt: number | undefined

  const httpOptions = (signal?: AbortSignal, stage?: ProviderDiagnostic['stage']) => ({
    fetch: fetchImplementation,
    now,
    sleep,
    timeoutMs,
    maxRetries,
    maxRetryDelayMs,
    signal,
    stage,
    diagnostics: options.diagnostics,
  })

  async function resolveCredential(draft?: string, signal?: AbortSignal): Promise<string> {
    const value = draft?.trim() || (await options.credentials.read(signal))
    if (!value) {
      throw new AgentRuntimeError(
        'PROVIDER_NOT_CONFIGURED',
        'Configure a Provider API credential before using the Agent.',
        { recommendedAction: 'Open Provider settings and enter an API key.' },
      )
    }
    return value
  }

  async function fetchCatalog(
    input: ProviderModelsInput,
    signal?: AbortSignal,
  ): Promise<{ baseUrl: string; apiKey: string; models: CatalogModel[]; refreshedAt: number }> {
    const baseUrl = normalizeProviderBaseUrl(input.baseUrl)
    const apiKey = await resolveCredential(input.apiKey, signal)
    const result = await requestProviderJson(
      `${baseUrl}/models`,
      { headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` } },
      httpOptions(signal, 'catalog'),
    )
    const models = parseCatalog(result.value)
    const refreshedAt = now()
    catalog = models
    lastRefreshAt = refreshedAt
    return { baseUrl, apiKey, models, refreshedAt }
  }

  async function listModels(input: ProviderModelsInput): Promise<ProviderModelsResult> {
    try {
      const refreshed = await fetchCatalog(input)
      const settings = await options.settings.read()
      const models: ProviderModelView[] = refreshed.models.map((model) => ({
        id: model.id,
        name: model.name,
        compatibility:
          settings?.compatibility === 'compatible' && settings.modelId === model.id
            ? 'compatible'
            : 'unknown',
      }))
      lastError = undefined
      return { models, refreshedAt: refreshed.refreshedAt }
    } catch (error) {
      lastError = safeProviderError(error)
      throw lastError
    }
  }

  async function testProvider(input: ProviderTestInput): Promise<ProviderTestResult> {
    try {
      const catalogStartedAt = now()
      const refreshed = await fetchCatalog(input)
      const selected = refreshed.models.find((model) => model.id === input.model)
      if (!selected) throw providerHttpError(404)
      const stages: ProviderProbeStageResult[] = [
        { stage: 'catalog', ok: true, latencyMs: elapsed(now, catalogStartedAt) },
      ]

      const previousKey = await options.credentials.read()
      await options.credentials.write(refreshed.apiKey)
      const settings: OpenAiCompatibleProviderSettings = {
        version: PROVIDER_SETTINGS_VERSION,
        baseUrl: refreshed.baseUrl,
        modelId: selected.id,
        modelName: selected.name,
        compatibility: 'compatible',
        lastTestedAt: now(),
        lastModelsRefreshAt: refreshed.refreshedAt,
      }
      try {
        await options.settings.write(settings)
      } catch (error) {
        if (previousKey) await options.credentials.write(previousKey)
        else await options.credentials.delete()
        throw error
      }
      lastError = undefined
      const latencyMs = elapsed(now, catalogStartedAt)
      return {
        compatible: true,
        model: selected.id,
        latencyMs,
        stages,
      }
    } catch (error) {
      lastError = safeProviderError(error)
      throw lastError
    }
  }

  async function getStatus(): Promise<ProviderStatusView> {
    let apiKey: string | undefined
    let settings: OpenAiCompatibleProviderSettings | undefined
    try {
      apiKey = await options.credentials.read()
      settings = await options.settings.read()
    } catch (error) {
      lastError = safeProviderError(error)
    }
    const configured = Boolean(apiKey)
    const compatible = configured && settings?.compatibility === 'compatible'
    return {
      state: lastError ? 'error' : compatible ? 'connected' : 'not-configured',
      providerLabel: OPENAI_COMPATIBLE_PROVIDER_LABEL,
      configured,
      baseUrl: settings?.baseUrl,
      modelId: settings?.modelId,
      modelLabel: settings?.modelName,
      fingerprint: apiKey ? await fingerprint(apiKey) : undefined,
      compatibility: compatible ? 'compatible' : lastError ? 'incompatible' : 'unknown',
      lastTestedAt: settings?.lastTestedAt,
      lastModelsRefreshAt: lastRefreshAt ?? settings?.lastModelsRefreshAt,
      error: lastError?.toView(),
    }
  }

  async function deleteCredential(): Promise<void> {
    await options.credentials.delete()
    lastError = undefined
  }

  async function createPlan(
    context: Parameters<RuntimeSupport['createPlan']>[0],
  ): Promise<PiRunPlan> {
    const [apiKey, settings] = await Promise.all([
      options.credentials.read(),
      options.settings.read(),
    ])
    if (!apiKey || settings?.compatibility !== 'compatible') {
      throw new AgentRuntimeError(
        'PROVIDER_NOT_CONFIGURED',
        'Configure an Agent-compatible model before starting a run.',
        { recommendedAction: 'Open Provider settings and test a model.' },
      )
    }
    const selected =
      catalog.find((model) => model.id === settings.modelId) ??
      ({ id: settings.modelId, name: settings.modelName } satisfies CatalogModel)
    const model = modelFromCatalog(settings.baseUrl, selected)
    const provider = createProvider({
      id: OPENAI_COMPATIBLE_PROVIDER_ID,
      name: OPENAI_COMPATIBLE_PROVIDER_LABEL,
      baseUrl: settings.baseUrl,
      auth: {
        apiKey: {
          name: 'Provider API key',
          resolve: async ({ signal }) => {
            signal.throwIfAborted()
            return { auth: { apiKey }, source: 'Main credential store' }
          },
        },
      },
      models: [model],
      api: openAICompletionsApi(),
    })
    const models = createModels()
    models.setProvider(provider)
    const observation: StreamObservation = { networkFailure: false }
    const trackedFetch: FetchFunction = async (input, init) => {
      const url = redactProviderUrl(input instanceof URL ? input.toString() : String(input))
      const method = init?.method?.toUpperCase() ?? 'POST'
      const startedAt = now()
      options.diagnostics?.({ phase: 'request', method, url, attempt: 1, stage: 'stream' })
      try {
        const response = await fetchImplementation(input, init)
        observation.status = response.status
        observation.retryAfterMs = parseRetryAfter(response.headers.get('retry-after'), now())
        options.diagnostics?.({
          phase: 'response',
          method,
          url,
          attempt: 1,
          status: response.status,
          contentType: response.headers.get('content-type') ?? undefined,
          durationMs: Math.max(0, now() - startedAt),
          stage: 'stream',
        })
        return response
      } catch (error) {
        if (!init?.signal?.aborted) observation.networkFailure = true
        options.diagnostics?.({
          phase: 'failure',
          method,
          url,
          attempt: 1,
          durationMs: Math.max(0, now() - startedAt),
          code: init?.signal?.aborted ? 'ABORTED' : 'PROVIDER_UNAVAILABLE',
          stage: 'stream',
        })
        throw error
      }
    }
    return {
      sessionId: context.sessionId,
      runId: context.runId,
      turnId: context.turnId,
      prompt: context.prompt,
      readOnly: context.readOnly,
      scope: { symbol: null, period: null, readOnly: context.readOnly },
      tools: [],
      model,
      streamFn: (streamModel, streamContext, streamOptions) =>
        models.streamSimple(streamModel, streamContext, {
          ...streamOptions,
          fetch: trackedFetch,
          timeoutMs,
          maxRetries,
          maxRetryDelayMs,
        }),
      classifyProviderError: (message) => classifyStreamError(message, observation),
      systemPrompt:
        'You are the KLineChartQuant financial analysis Agent. No chart tools are available in this build. Do not claim to have read or changed the chart. Answer only from user-provided text and state limitations clearly.',
    }
  }

  return {
    provider: { getStatus, listModels, test: testProvider, deleteCredential },
    createPlan: async (context) => {
      try {
        return await createPlan(context)
      } catch (error) {
        throw error instanceof AgentRuntimeError ? error : toAgentRuntimeError(error)
      }
    },
  }
}
