// OpenAI-compatible Provider 的模型发现与 Pi 流式运行计划适配。

import type { FetchFunction } from '@earendil-works/pi-ai'
import { createModels, createProvider } from '@earendil-works/pi-ai'
import type { RuntimeSupport } from '../application/types.js'
import { AgentRuntimeError, toAgentRuntimeError } from '../contracts/errors.js'
import type { AgentRunContext } from '../contracts/ui.js'
import type { AgentRunPlan } from '../pi/types.js'
import {
  normalizeProviderBaseUrl,
  redactProviderUrl,
  requestProviderJson,
  sleepWithSignal,
} from './http.js'
import {
  type NormalizedProviderCatalogModel,
  parseProviderModelCatalog,
  providerModelView,
} from './model-catalog.js'
import { getProviderApiProtocolAdapter } from './protocol.js'
import type {
  OpenAiCompatibleProviderSettings,
  OpenAiCompatibleRuntimeOptions,
  ProviderDiagnostic,
  ProviderModelsInput,
  ProviderModelsResult,
} from './types.js'
import { OPENAI_COMPATIBLE_PROVIDER_ID, OPENAI_COMPATIBLE_PROVIDER_LABEL } from './types.js'

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

/**
 * 构造会话内稳定的系统提示词。
 *
 * 时间、图表选择等每轮变化的内容一律不进入这里；它们由 {@link createTurnContext}
 * 拼进本轮用户消息，保证 tools + system 前缀跨 run 逐字节一致。
 */
function createSystemPrompt(hasTools: boolean, hasWebSearch: boolean): string {
  const base = 'You are the KLineChartQuant financial analysis Agent.'
  if (!hasTools) {
    return `${base} No chart tools are available in this build. Do not claim to have read or changed the chart. Answer only from the user-provided text and state limitations clearly.`
  }
  const citationInstruction = hasWebSearch
    ? ' When using web_search evidence, cite each supporting claim immediately after the claim. Copy a citation marker exactly from the citationExamples returned by web_search.'
    : ''
  return `${base} When the user message includes chart context, it is authoritative UI context: do not use tools to rediscover the current symbol or selected time range; use tools only for chart evidence that is not in the user message. When it includes selected-kline-bars, that is the complete OHLCV data for the selected range; analyze it directly and do not call market_bars_query for that range.${citationInstruction} Plan and Build modes exist. In Plan mode state-changing tools are rejected; investigate, then propose the exact change and let the user switch to Build mode. In Build mode apply changes deliberately, and never claim a change you did not make. When a tool result reports { "status": "ambiguous" }, never guess: call ask_user with one option per returned candidate, wait for the user to choose, then retry the original tool with the chosen candidate's routing fields.`
}

/** 渲染本轮用户消息前的易变上下文；只追加在历史之后，不改系统提示词。 */
function createTurnContext(context: AgentRunContext | undefined, referenceTime: string): string {
  const lines = [`Current date and time (${AGENT_REFERENCE_TIMEZONE}): ${referenceTime}.`]
  if (context?.items.length)
    lines.push(`Chart context: ${JSON.stringify(context.items)}. This is authoritative UI context.`)
  return lines.join('\n')
}

/** OpenAI-compatible 运行时支持：运行计划与远端模型目录。 */
export interface OpenAiCompatibleRuntimeSupport extends RuntimeSupport {
  /** 读取远端模型目录；不缓存，每次调用都现取。 */
  catalog: {
    listModels(input: ProviderModelsInput): Promise<ProviderModelsResult>
  }
}

/** 创建 OpenAI-compatible Provider 的运行时支持对象。 */
export function createOpenAiCompatibleRuntimeSupport(
  options: OpenAiCompatibleRuntimeOptions,
): OpenAiCompatibleRuntimeSupport {
  const fetchImplementation = options.fetch ?? globalThis.fetch
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? sleepWithSignal
  const timeoutMs = options.requestTimeoutMs ?? 30_000
  // 默认不重试：一次失败直接暴露给用户，由用户手动重试，避免浏览器里被静默重发多次。
  const maxRetries = options.maxRetries ?? 0
  const maxRetryDelayMs = options.maxRetryDelayMs ?? 60_000

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
        'Configure a Provider API credential before reading the model catalog.',
        { recommendedAction: 'Open Provider settings and save an API key.' },
      )
    }
    return value
  }

  /**
   * 拉取远端模型目录。
   * @param input 模型目录请求参数。
   * @returns 已通过校验的模型列表及刷新时间。
   * @throws {AgentRuntimeError} HTTP 失败、凭据缺失或目录结构非法时抛出。
   */
  async function listModels(input: ProviderModelsInput): Promise<ProviderModelsResult> {
    const baseUrl = normalizeProviderBaseUrl(input.baseUrl)
    const apiKey = await resolveCredential(input.apiKey)
    const result = await requestProviderJson(
      `${baseUrl}/models`,
      { headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` } },
      // 目录请求不合并附加请求头：浏览器预检只允许固定的几个头，未知头会让请求被直接拦掉。
      httpOptions({}, undefined, 'catalog'),
    )
    let models: NormalizedProviderCatalogModel[]
    try {
      models = parseProviderModelCatalog(result.value)
    } catch {
      throw malformed('The Provider returned an invalid model catalog.')
    }
    return {
      models: models.map((model) => providerModelView(model)),
      refreshedAt: now(),
    }
  }

  /**
   * 基于已选模型设置构造 Pi 的单次流式运行计划。
   * @param run 本次运行的会话、提示词、权限与界面上下文。
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
    const selected = toCatalogModel(settings)
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
    // 工具表由会话配置与设置文档决定，与运行模式无关；模式只在执行期 gate 写工具。
    const tools = (await options.tools?.(run)) ?? []
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
      ),
      turnContext: createTurnContext(run.context, formatReferenceTime(now())),
    }
  }

  return {
    catalog: { listModels },
    createPlan: async (context) => {
      try {
        return await createPlan(context)
      } catch (error) {
        throw error instanceof AgentRuntimeError ? error : toAgentRuntimeError(error)
      }
    },
  }
}

/** 把已选模型设置投影成 Pi 适配器需要的模型描述。 */
function toCatalogModel(
  settings: OpenAiCompatibleProviderSettings,
): NormalizedProviderCatalogModel {
  return {
    id: settings.modelId,
    name: settings.modelName,
    maxOutputTokens: settings.maxOutputTokens,
    reasoningEfforts: [...settings.reasoningEfforts],
    ...(settings.contextWindow === undefined ? {} : { contextWindow: settings.contextWindow }),
  }
}
