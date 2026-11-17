// OpenAI-compatible Provider 的模型发现、连接验证与 Pi 流式运行计划适配。

import type { FetchFunction } from '@earendil-works/pi-ai'
import { createModels, createProvider } from '@earendil-works/pi-ai'
import type { RuntimeSupport } from '../application/unavailable-runtime.js'
import { AgentRuntimeError, toAgentRuntimeError } from '../contracts/errors.js'
import type {
  AgentRunContext,
  ProviderModelsInput,
  ProviderModelsResult,
  ProviderModelView,
  ProviderStatusView,
} from '../contracts/ui.js'
import type { AgentRunPlan } from '../pi/types.js'
import {
  normalizeProviderBaseUrl,
  redactProviderUrl,
  requestProviderJson,
  sleepWithSignal,
} from './http.js'
import {
  type ProviderCatalogModel,
  parseProviderModelCatalog,
  providerModelView,
} from './model-catalog.js'
import { getProviderApiProtocolAdapter } from './protocol.js'
import type {
  OpenAiCompatibleProviderSettings,
  OpenAiCompatibleRuntimeOptions,
  ProviderDiagnostic,
} from './types.js'
import {
  OPENAI_COMPATIBLE_PROVIDER_ID,
  OPENAI_COMPATIBLE_PROVIDER_LABEL,
} from './types.js'

/** 合并 Provider 附加请求头，保留运行时生成的鉴权和协议头优先级。 */
function createProviderFetch(
  fetchImplementation: typeof globalThis.fetch,
  headers: Record<string, string>,
): typeof globalThis.fetch {
  return (input, init) => {
    const mergedHeaders = new Headers(headers)
    new Headers(init?.headers).forEach((value, name) => mergedHeaders.set(name, value))
    return fetchImplementation(input, { ...init, headers: mergedHeaders })
  }
}

/** Agent 参照行情交易日与盘中的固定时区。 */
const AGENT_REFERENCE_TIMEZONE = 'Asia/Shanghai'

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

/** 将毫秒时间戳格式化为行情时区的可读日期时间，供系统提示词注入。 */
function formatReferenceTime(timestamp: number): string {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: AGENT_REFERENCE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(timestamp))
  const values: Record<string, string> = {}
  for (const part of parts) values[part.type] = part.value
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`
}

/** 构造系统提示词；能力说明由本轮工具清单推导，不再读运行模式。 */
function createSystemPrompt(
  hasTools: boolean,
  hasWebSearch: boolean,
  referenceTime: string,
  writesAllowed: boolean,
  context?: AgentRunContext,
): string {
  const base = `You are the KLineChartQuant financial analysis Agent. Current date and time (${AGENT_REFERENCE_TIMEZONE}): ${referenceTime}.`
  const hasSelectedKLineBars = context?.items.some((item) => item.kind === 'selected-kline-bars')
  const chartContext = context?.items.length
    ? ` Current chart context: ${JSON.stringify(context.items)}. This is authoritative UI context. Do not use tools to rediscover the current symbol or selected time range; use tools only for chart evidence not included here.`
    : ''
  const selectedKLineBarsInstruction = hasSelectedKLineBars
    ? ' The selected-kline-bars context contains the complete OHLCV data for the selected time range, formatted exactly as Query market bars. Analyze it directly and do not call market_bars_query for that range.'
    : ''
  const citationInstruction = hasWebSearch
    ? ' When using web_search evidence, cite each supporting claim immediately after the claim. Copy a citation marker exactly from the citationExamples returned by web_search. For example, if web_search returns [[cite:web:run-1:call-1:1]], write: The company reported rising costs. [[cite:web:run-1:call-1:1]]'
    : ''
  const ambiguityInstruction = hasTools
    ? ' When a tool result reports { "status": "ambiguous" }, never guess: call ask_user with one option per returned candidate, wait for the user to choose, then retry the original tool with the chosen candidate\'s routing fields.'
    : ''
  if (!hasTools) {
    return `${base}${chartContext}${selectedKLineBarsInstruction} No chart tools are available in this build. Do not claim to have read or changed the chart. Answer only from user-provided text and state limitations clearly.`
  }
  const capabilityInstruction = writesAllowed
    ? ' Use the supplied chart tools when chart evidence is needed. You may change the chart through the write tools; make each change deliberately and never claim a change you did not make.'
    : ' Only read-only tools are available in this run, so you cannot change the chart. Investigate, then propose the exact change you would make and let the user enable the write tools to apply it. Never claim you changed the chart.'
  return `${base}${chartContext}${selectedKLineBarsInstruction}${citationInstruction}${capabilityInstruction}${ambiguityInstruction}`
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
  let catalog: ProviderCatalogModel[] = []
  let lastError: AgentRuntimeError | undefined

  /** 构造各阶段共用的 HTTP 运行参数。 */
  const httpOptions = (
    headers: Record<string, string> = {},
    signal?: AbortSignal,
    stage?: ProviderDiagnostic['stage'],
  ) => ({
    fetch: createProviderFetch(fetchImplementation, headers),
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
  ): Promise<{
    baseUrl: string
    apiKey: string
    models: ProviderCatalogModel[]
    refreshedAt: number
  }> {
    const baseUrl = normalizeProviderBaseUrl(input.baseUrl)
    const apiKey = await resolveCredential(input.apiKey, signal)
    const result = await requestProviderJson(
      `${baseUrl}/models`,
      { headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` } },
      httpOptions(input.headers, signal, 'catalog'),
    )
    let models: ProviderCatalogModel[]
    try {
      models = parseProviderModelCatalog(result.value)
    } catch {
      throw malformed('The Provider returned an invalid model catalog.')
    }
    const refreshedAt = now()
    // 仅在完整目录通过校验后替换缓存，避免部分响应污染后续运行。
    catalog = models
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
      lastError = undefined
      return {
        models: refreshed.models.map((model) => providerModelView(model)),
        refreshedAt: refreshed.refreshedAt,
      }
    } catch (error) {
      lastError = safeProviderError(error)
      throw lastError
    }
  }

  /**
   * 读取 Provider 当前配置与最近错误。
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
    return {
      state: lastError ? 'error' : configured && settings ? 'connected' : 'not-configured',
      providerLabel: OPENAI_COMPATIBLE_PROVIDER_LABEL,
      configured,
      baseUrl: settings?.baseUrl,
      modelId: settings?.modelId,
      modelLabel: settings?.modelName,
      protocol: settings?.protocol,
      headers: settings?.headers,
      contextWindow: settings?.contextWindow,
      maxOutputTokens: settings?.maxOutputTokens,
      reasoningEfforts: settings?.reasoningEfforts,
      reasoningEffort: settings?.reasoningEffort,
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
   * @param input 本次运行的会话、提示词、权限与界面上下文。
   * @returns 含模型、工具、流参数与系统提示词的运行计划。
   */
  async function createPlan(
    run: Parameters<RuntimeSupport['createPlan']>[0],
  ): Promise<AgentRunPlan> {
    const [apiKey, settings] = await Promise.all([
      options.credentials.read(),
      options.settings.read(),
    ])
    if (!apiKey || !settings) {
      throw new AgentRuntimeError(
        'PROVIDER_NOT_CONFIGURED',
        'Configure an Agent-compatible model before starting a run.',
        { recommendedAction: 'Open Provider settings and choose a model.' },
      )
    }
    // 目录缓存可为空，使用已验证设置作为离线运行的回退模型描述。
    const selected =
      catalog.find((model) => model.id === settings.modelId) ??
      ({
        id: settings.modelId,
        name: settings.modelName,
        contextWindow: settings.contextWindow,
        maxOutputTokens: settings.maxOutputTokens,
        reasoningEfforts: settings.reasoningEfforts,
        defaultReasoningEffort: settings.reasoningEffort,
      } satisfies ProviderCatalogModel)
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
    const providerFetch = createProviderFetch(fetchImplementation, settings.headers)
    // 包装 Pi 的 fetch，只采集方法、URL、状态与耗时，不记录请求正文。
    const trackedFetch: FetchFunction = async (input, init) => {
      const url = redactProviderUrl(input instanceof URL ? input.toString() : String(input))
      const method = init?.method?.toUpperCase() ?? 'POST'
      const startedAt = now()
      options.diagnostics?.({ phase: 'request', method, url, attempt: 1, stage: 'stream' })
      try {
        const response = await providerFetch(input, init)
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
    // 工具由宿主按运行上下文提供；运行模式决定本轮暴露哪些工具。
    const availableTools = options.tools?.(run) ?? []
    const tools = availableTools
    return {
      models,
      model,
      tools,
      reasoningEffort: settings.reasoningEffort,
      streamOptions: adapter.streamOptions({
        fetch: trackedFetch,
        timeoutMs,
        maxRetries,
        maxRetryDelayMs,
      }),
      systemPrompt: createSystemPrompt(
        tools.length > 0,
        tools.some((tool) => tool.name === 'web_search'),
        formatReferenceTime(now()),
        tools.some((tool) => tool.effect === 'write'),
        run.context,
      ),
    }
  }

  return {
    provider: { getStatus, listModels, deleteCredential },
    createPlan: async (context) => {
      try {
        return await createPlan(context)
      } catch (error) {
        throw error instanceof AgentRuntimeError ? error : toAgentRuntimeError(error)
      }
    },
  }
}
