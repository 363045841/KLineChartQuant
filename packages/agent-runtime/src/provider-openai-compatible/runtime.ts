// OpenAI-compatible Provider 的模型发现、连接验证与 Pi 流式运行计划适配。
import { createModels, createProvider } from '@earendil-works/pi-ai'

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
  getProviderApiProtocolAdapter,
  type ProviderStreamObservation,
} from './protocol.js'
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
import type { FetchFunction } from '@earendil-works/pi-ai'

const MAX_CATALOG_MODELS = 2_000
const MAX_MODEL_ID_LENGTH = 256

/** 模型目录中经过运行时校验的最小模型描述。 */
interface CatalogModel {
  id: string
  name: string
}

/** 判断未知值是否为普通对象，供 Provider 响应校验使用。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 校验 Provider `/models` 响应并限制目录规模与字段长度。
 *
 * @param value 待解析的未知响应值。
 * @returns 去重并按 ID 排序的模型目录。
 * @throws {AgentRuntimeError} 目录结构无效或没有有效模型时抛出。
 */
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

/** 创建统一的 Provider 响应格式错误。 */
function malformed(message = 'The Provider returned a malformed response.'): AgentRuntimeError {
  return new AgentRuntimeError('PROVIDER_MALFORMED_RESPONSE', message, {
    retryable: true,
    recommendedAction: 'Retry the request or select another model.',
  })
}

/** 将未知异常转换为不会暴露底层实现细节的 Provider 错误。 */
function safeProviderError(error: unknown): AgentRuntimeError {
  if (error instanceof AgentRuntimeError) return error
  return new AgentRuntimeError('PROVIDER_ERROR', 'The Provider operation failed.', {
    retryable: true,
    recommendedAction: 'Retry the operation or test the Provider connection.',
    cause: error,
  })
}

/** 计算非负耗时，防御测试时钟或系统时钟回拨。 */
function elapsed(now: () => number, startedAt: number): number {
  return Math.max(0, now() - startedAt)
}

/**
 * 生成 API Key 的短 SHA-256 指纹，供状态界面识别凭据变化。
 *
 * @param value 原始 API Key。
 * @returns 不可逆的短哈希标识，不返回密钥内容。
 */
async function fingerprint(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return `sha256:${[...new Uint8Array(digest)]
    .slice(0, 6)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`
}

/** 创建 OpenAI-compatible Provider 的运行时支持对象。 */
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

  /** 构造各阶段共用的 HTTP 运行参数。 */
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

  /**
   * 优先使用本次输入的 API Key，否则读取已保存凭据。
   * @param draft 临时输入的 API Key。
   * @param signal 读取凭据时使用的取消信号。
   * @returns 非空 API Key。
   * @throws {AgentRuntimeError} 未配置凭据时抛出。
   */
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

  /**
   * 拉取并缓存 Provider 模型目录。
   * @param input 模型目录请求参数。
   * @param signal 请求和凭据读取的取消信号。
   * @returns 已标准化地址、凭据、目录及刷新时间。
   */
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
    // 仅在完整目录通过校验后替换缓存，避免部分响应污染后续运行。
    catalog = models
    lastRefreshAt = refreshedAt
    return { baseUrl, apiKey, models, refreshedAt }
  }

  /**
   * 返回适配 UI 的模型列表，并记录最近一次查询错误。
   * @param input 模型目录请求参数。
   * @returns UI 模型列表及刷新时间。
   */
  async function listModels(input: ProviderModelsInput): Promise<ProviderModelsResult> {
    try {
      const refreshed = await fetchCatalog(input)
      const settings = await options.settings.read()
      const models: ProviderModelView[] = refreshed.models.map((model) => ({
        id: model.id,
        name: model.name,
        compatibility:
          settings?.compatibility === 'compatible' &&
          settings.modelId === model.id &&
          settings.protocol === input.protocol
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

  /**
   * 验证模型存在性并以凭据、设置两阶段写入保存连接。
   * @param input Provider 连接测试参数。
   * @returns 验证阶段及总耗时。
   */
  async function testProvider(input: ProviderTestInput): Promise<ProviderTestResult> {
    try {
      const catalogStartedAt = now()
      const refreshed = await fetchCatalog(input)
      const selected = refreshed.models.find((model) => model.id === input.model)
      if (!selected) throw providerHttpError(404)
      const stages: ProviderProbeStageResult[] = [
        { stage: 'catalog', ok: true, latencyMs: elapsed(now, catalogStartedAt) },
      ]
      const adapter = getProviderApiProtocolAdapter(input.protocol)
      const textStartedAt = now()
      await adapter.probeText({
        baseUrl: refreshed.baseUrl,
        apiKey: refreshed.apiKey,
        modelId: selected.id,
        http: httpOptions(undefined, 'text'),
      })
      stages.push({ stage: 'text', ok: true, latencyMs: elapsed(now, textStartedAt) })
      const toolStartedAt = now()
      await adapter.probeTool({
        baseUrl: refreshed.baseUrl,
        apiKey: refreshed.apiKey,
        modelId: selected.id,
        nonce: globalThis.crypto.randomUUID(),
        http: httpOptions(undefined, 'tool'),
      })
      stages.push({ stage: 'tool', ok: true, latencyMs: elapsed(now, toolStartedAt) })

      const previousKey = await options.credentials.read()
      await options.credentials.write(refreshed.apiKey)
      const settings: OpenAiCompatibleProviderSettings = {
        version: PROVIDER_SETTINGS_VERSION,
        baseUrl: refreshed.baseUrl,
        modelId: selected.id,
        modelName: selected.name,
        protocol: adapter.protocol,
        compatibility: 'compatible',
        lastTestedAt: now(),
        lastModelsRefreshAt: refreshed.refreshedAt,
      }
      try {
        await options.settings.write(settings)
      } catch (error) {
        // 设置写入失败时恢复旧凭据，避免留下无法配对的新 Key。
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

  /**
   * 读取 Provider 当前配置、验证状态与最近错误。
   * @returns 可直接渲染的 Provider 状态视图。
   */
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
      protocol: settings?.protocol,
      fingerprint: apiKey ? await fingerprint(apiKey) : undefined,
      compatibility: compatible ? 'compatible' : lastError ? 'incompatible' : 'unknown',
      lastTestedAt: settings?.lastTestedAt,
      lastModelsRefreshAt: lastRefreshAt ?? settings?.lastModelsRefreshAt,
      error: lastError?.toView(),
    }
  }

  /** 删除 API Key 并清除内存中的最近错误。 */
  async function deleteCredential(): Promise<void> {
    await options.credentials.delete()
    lastError = undefined
  }

  /**
   * 基于已验证设置构造 Pi 的单次流式运行计划。
   * @param context 当前 Agent 运行上下文。
   * @returns 含模型、工具、流函数及错误分类器的运行计划。
   */
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
    // 目录缓存可为空，使用已验证设置作为离线运行的回退模型描述。
    const selected =
      catalog.find((model) => model.id === settings.modelId) ??
      ({ id: settings.modelId, name: settings.modelName } satisfies CatalogModel)
    const adapter = getProviderApiProtocolAdapter(settings.protocol)
    const model = adapter.createModel(settings.baseUrl, selected)
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
      api: adapter.createApi(),
    })
    const models = createModels()
    models.setProvider(provider)
    const observation: ProviderStreamObservation = { networkFailure: false }
    // 包装 Pi 的 fetch，采集脱敏诊断并保留流式错误分类所需的 HTTP 信息。
    const trackedFetch: FetchFunction = async (input, init) => {
      observation.status = undefined
      observation.retryAfterMs = undefined
      observation.networkFailure = false
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
    // 工具由宿主按运行上下文提供，运行时本身不持有业务能力。
    const availableTools = options.tools?.(context) ?? []
    const tools = context.readOnly
      ? availableTools.filter((tool) => tool.safety === 'read-only')
      : availableTools
    return {
      sessionId: context.sessionId,
      runId: context.runId,
      turnId: context.turnId,
      prompt: context.prompt,
      readOnly: context.readOnly,
      scope: { symbol: null, period: null, readOnly: context.readOnly },
      tools,
      model,
      streamFn: (streamModel, streamContext, streamOptions) =>
        models.streamSimple(
          streamModel,
          streamContext,
          adapter.streamOptions({
            ...streamOptions,
            fetch: trackedFetch,
            timeoutMs,
            maxRetries,
            maxRetryDelayMs,
          }),
        ),
      classifyProviderError: (message) => adapter.classifyStreamError(message, observation),
      systemPrompt:
        tools.length > 0
          ? 'You are the KLineChartQuant financial analysis Agent. Use the supplied chart tools when chart evidence is needed. Do not claim to have changed the chart: the available tools are read-only.'
          : 'You are the KLineChartQuant financial analysis Agent. No chart tools are available in this build. Do not claim to have read or changed the chart. Answer only from user-provided text and state limitations clearly.',
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
