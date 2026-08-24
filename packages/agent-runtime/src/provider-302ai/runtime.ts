import { createModels, createProvider } from '@earendil-works/pi-ai'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'

import { AgentRuntimeError, toAgentRuntimeError } from '../contracts/errors.js'

import {
  normalize302AiBaseUrl,
  parseRetryAfter,
  providerHttpError,
  requestProviderJson,
  sleepWithSignal,
} from './http.js'
import {
  DEFAULT_302AI_BASE_URL,
  PROVIDER_302AI_ID,
  PROVIDER_302AI_LABEL,
  PROVIDER_SETTINGS_VERSION,
} from './types.js'

import type {
  Provider302AiRuntimeOptions,
  Provider302AiSettings,
  ProviderCredentialMetadata,
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
const PROBE_FUNCTION = 'kq_compatibility_probe'

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
    throw malformed('302.ai returned an invalid model catalog.')
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
  if (unique.size === 0) throw malformed('302.ai returned an empty model catalog.')
  return [...unique.values()].sort((left, right) => left.id.localeCompare(right.id))
}

function malformed(message = '302.ai returned a malformed response.'): AgentRuntimeError {
  return new AgentRuntimeError('PROVIDER_MALFORMED_RESPONSE', message, {
    retryable: true,
    recommendedAction: 'Retry the request or select another model.',
  })
}

function incompatibleTools(): AgentRuntimeError {
  return new AgentRuntimeError(
    'PROVIDER_INCOMPATIBLE_TOOLS',
    'The selected model did not return a compatible tool call.',
    {
      recommendedAction: 'Select a model that passes the Agent compatibility test.',
    },
  )
}

function safeProviderError(error: unknown): AgentRuntimeError {
  if (error instanceof AgentRuntimeError) return error
  return new AgentRuntimeError('PROVIDER_ERROR', 'The 302.ai operation failed.', {
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
    provider: PROVIDER_302AI_ID,
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

function textFromCompletion(value: unknown): string {
  if (!isRecord(value) || !Array.isArray(value.choices)) throw malformed()
  const choice = value.choices[0]
  if (!isRecord(choice) || !isRecord(choice.message)) throw malformed()
  const { content } = choice.message
  if (typeof content !== 'string' || !content.trim()) throw malformed()
  return content
}

function assertProbeToolCall(value: unknown, nonce: string): void {
  if (!isRecord(value) || !Array.isArray(value.choices)) throw incompatibleTools()
  const choice = value.choices[0]
  if (!isRecord(choice) || !isRecord(choice.message) || !Array.isArray(choice.message.tool_calls)) {
    throw incompatibleTools()
  }
  const call = choice.message.tool_calls[0]
  if (!isRecord(call) || !isRecord(call.function) || call.function.name !== PROBE_FUNCTION) {
    throw incompatibleTools()
  }
  const rawArguments = call.function.arguments
  let args: unknown
  try {
    args = typeof rawArguments === 'string' ? JSON.parse(rawArguments) : rawArguments
  } catch {
    throw incompatibleTools()
  }
  if (!isRecord(args) || args.nonce !== nonce || Object.keys(args).length !== 1) {
    throw incompatibleTools()
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
      'The 302.ai request timed out.',
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
      'The app could not reach 302.ai.',
      true,
      'Check the network connection and retry.',
    )
  }
  return streamError(
    'PROVIDER_ERROR',
    'The 302.ai request failed.',
    true,
    'Retry the request or select another model.',
  )
}

export function create302AiRuntimeSupport(options: Provider302AiRuntimeOptions): RuntimeSupport {
  const fetchImplementation = options.fetch ?? globalThis.fetch
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? sleepWithSignal
  const timeoutMs = options.requestTimeoutMs ?? 30_000
  const maxRetries = options.maxRetries ?? 2
  const maxRetryDelayMs = options.maxRetryDelayMs ?? 60_000
  let catalog: CatalogModel[] = []
  let lastError: AgentRuntimeError | undefined
  let lastRefreshAt: number | undefined

  const httpOptions = (signal?: AbortSignal) => ({
    fetch: fetchImplementation,
    now,
    sleep,
    timeoutMs,
    maxRetries,
    maxRetryDelayMs,
    signal,
  })

  async function resolveCredential(draft?: string, signal?: AbortSignal): Promise<string> {
    const value = draft?.trim() || (await options.credentials.read(signal))
    if (!value) {
      throw new AgentRuntimeError(
        'PROVIDER_NOT_CONFIGURED',
        'Configure a 302.ai API credential before using the Agent.',
        { recommendedAction: 'Open Provider settings and enter an API key.' },
      )
    }
    return value
  }

  async function fetchCatalog(
    input: ProviderModelsInput,
    signal?: AbortSignal,
  ): Promise<{ baseUrl: string; apiKey: string; models: CatalogModel[]; refreshedAt: number }> {
    const baseUrl = normalize302AiBaseUrl(input.baseUrl || DEFAULT_302AI_BASE_URL)
    const apiKey = await resolveCredential(input.apiKey, signal)
    const result = await requestProviderJson(
      `${baseUrl}/models`,
      { headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` } },
      httpOptions(signal),
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

  async function requestCompletion(
    baseUrl: string,
    apiKey: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    return (
      await requestProviderJson(
        `${baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        httpOptions(),
      )
    ).value
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

      const textStartedAt = now()
      const textValue = await requestCompletion(refreshed.baseUrl, refreshed.apiKey, {
        model: selected.id,
        messages: [{ role: 'user', content: 'Reply with OK.' }],
        temperature: 0,
        max_tokens: 8,
        stream: false,
      })
      textFromCompletion(textValue)
      const textLatency = elapsed(now, textStartedAt)
      stages.push({ stage: 'text', ok: true, latencyMs: textLatency, ttftMs: textLatency })

      const nonce = globalThis.crypto.randomUUID()
      const toolStartedAt = now()
      const toolValue = await requestCompletion(refreshed.baseUrl, refreshed.apiKey, {
        model: selected.id,
        messages: [
          {
            role: 'user',
            content: `Call ${PROBE_FUNCTION} once with nonce ${nonce}. Do not answer with text.`,
          },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: PROBE_FUNCTION,
              description: 'Verify harmless Agent tool-call compatibility.',
              parameters: {
                type: 'object',
                additionalProperties: false,
                properties: { nonce: { type: 'string', const: nonce } },
                required: ['nonce'],
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: PROBE_FUNCTION } },
        temperature: 0,
        max_tokens: 64,
        stream: false,
      })
      assertProbeToolCall(toolValue, nonce)
      stages.push({ stage: 'tool', ok: true, latencyMs: elapsed(now, toolStartedAt) })

      const previousKey = await options.credentials.read()
      await options.credentials.write(refreshed.apiKey)
      const settings: Provider302AiSettings = {
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
      const latencyMs = stages.reduce((total, stage) => total + stage.latencyMs, 0)
      return {
        compatible: true,
        model: selected.id,
        latencyMs,
        ttftMs: textLatency,
        stages,
      }
    } catch (error) {
      lastError = safeProviderError(error)
      throw lastError
    }
  }

  async function getStatus(): Promise<ProviderStatusView> {
    let apiKey: string | undefined
    let settings: Provider302AiSettings | undefined
    let metadata: ProviderCredentialMetadata = { persistenceMode: 'memory-only' }
    try {
      metadata = await options.credentials.metadata()
      apiKey = await options.credentials.read()
      settings = await options.settings.read()
    } catch (error) {
      lastError = safeProviderError(error)
    }
    const configured = Boolean(apiKey)
    const compatible = configured && settings?.compatibility === 'compatible'
    return {
      state: lastError ? 'error' : compatible ? 'connected' : 'not-configured',
      providerLabel: PROVIDER_302AI_LABEL,
      configured,
      baseUrl: settings?.baseUrl ?? DEFAULT_302AI_BASE_URL,
      modelId: settings?.modelId,
      modelLabel: settings?.modelName,
      fingerprint: apiKey ? await fingerprint(apiKey) : undefined,
      persistenceMode: metadata.persistenceMode,
      compatibility: compatible ? 'compatible' : lastError ? 'incompatible' : 'unknown',
      lastTestedAt: settings?.lastTestedAt,
      lastModelsRefreshAt: lastRefreshAt ?? settings?.lastModelsRefreshAt,
      warning: metadata.warning,
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
        'Configure an Agent-compatible 302.ai model before starting a run.',
        { recommendedAction: 'Open Provider settings and test a model.' },
      )
    }
    const selected =
      catalog.find((model) => model.id === settings.modelId) ??
      ({ id: settings.modelId, name: settings.modelName } satisfies CatalogModel)
    const model = modelFromCatalog(settings.baseUrl, selected)
    const provider = createProvider({
      id: PROVIDER_302AI_ID,
      name: PROVIDER_302AI_LABEL,
      baseUrl: settings.baseUrl,
      auth: {
        apiKey: {
          name: '302.ai API key',
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
      try {
        const response = await fetchImplementation(input, init)
        observation.status = response.status
        observation.retryAfterMs = parseRetryAfter(response.headers.get('retry-after'), now())
        return response
      } catch (error) {
        if (!init?.signal?.aborted) observation.networkFailure = true
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
