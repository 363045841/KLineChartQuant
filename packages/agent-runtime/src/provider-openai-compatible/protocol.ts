// OpenAI-compatible 协议适配边界：集中协议元数据、探针与流错误分类。

import type {
  AssistantMessage,
  Model,
  ProviderStreams,
  SimpleStreamOptions,
} from '@earendil-works/pi-ai'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy'
import type { AgentRuntimeErrorCode } from '../contracts/errors.js'
import { AgentRuntimeError } from '../contracts/errors.js'
import type { ProviderApiProtocol, ProviderReasoningEffort } from '../contracts/provider.js'
import type { ProviderErrorDetails } from './http.js'
import { providerHttpError } from './http.js'
import { DEFAULT_PROVIDER_CONTEXT_WINDOW, OPENAI_COMPATIBLE_PROVIDER_ID } from './types.js'

// 推理模型在 Responses 协议里 max_output_tokens 是思考与正文的共享总预算；
// 过低会导致长链思考耗尽预算后被截断，正文一个字都产不出。
// Agent 单次推理默认可生成的最大 token 数。
const DEFAULT_MAX_TOKENS = 16_384

export interface ProviderCatalogModel {
  id: string
  name: string
  contextWindow?: number
  maxOutputTokens?: number
  reasoningEfforts?: readonly ProviderReasoningEffort[]
  defaultReasoningEffort?: ProviderReasoningEffort
}

export interface ProviderStreamObservation {
  status?: number
  retryAfterMs?: number
  error?: ProviderErrorDetails
  networkFailure: boolean
}

export interface ProviderApiProtocolAdapter {
  readonly protocol: ProviderApiProtocol
  createApi(): ProviderStreams
  createModel(baseUrl: string, model: ProviderCatalogModel): Model<ProviderApiProtocol>
  streamOptions(options: SimpleStreamOptions): SimpleStreamOptions
  classifyStreamError(
    message: AssistantMessage,
    observation: ProviderStreamObservation,
  ): AgentRuntimeError
}

// 判断协议响应节点是否为可安全读取的普通对象。
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// 创建不携带上游响应正文的稳定错误。
function malformedResponse(): AgentRuntimeError {
  return new AgentRuntimeError(
    'PROVIDER_MALFORMED_RESPONSE',
    'The Provider returned a malformed response.',
    {
      retryable: true,
      recommendedAction: 'Retry the connection test or select another model.',
    },
  )
}

// 创建流阶段使用的稳定运行时错误。
function streamError(
  code: AgentRuntimeErrorCode,
  message: string,
  retryable: boolean,
  recommendedAction: string,
): AgentRuntimeError {
  return new AgentRuntimeError(code, message, { retryable, recommendedAction })
}

// 按 HTTP 观测和协议错误特征归一化 Pi 的流错误。
function classifyStreamError(
  message: AssistantMessage,
  observation: ProviderStreamObservation,
  malformedPattern: RegExp,
): AgentRuntimeError {
  if (observation.status && observation.status >= 400) {
    return providerHttpError(observation.status, observation.retryAfterMs, observation.error)
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
  if (malformedPattern.test(category)) return malformedResponse()
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

// 构造两个 OpenAI-compatible 协议共享的 Pi 模型元数据。
function commonModel<TProtocol extends ProviderApiProtocol>(
  protocol: TProtocol,
  baseUrl: string,
  model: ProviderCatalogModel,
): Omit<Model<TProtocol>, 'compat'> {
  return {
    id: model.id,
    name: model.name,
    api: protocol,
    provider: OPENAI_COMPATIBLE_PROVIDER_ID,
    baseUrl,
    // OpenAI-compatible reasoning models may emit thinking blocks even when no vendor-specific
    // request parameter is required. Keep the capability enabled so Pi preserves those blocks.
    reasoning: true,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: model.contextWindow ?? DEFAULT_PROVIDER_CONTEXT_WINDOW,
    maxTokens: model.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
  }
}

const completionsAdapter: ProviderApiProtocolAdapter = {
  protocol: 'openai-completions',
  createApi: openAICompletionsApi,
  createModel(baseUrl, model) {
    return {
      ...commonModel('openai-completions', baseUrl, model),
      compat: {
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsReasoningEffort: (model.reasoningEfforts?.length ?? 0) > 0,
        supportsUsageInStreaming: false,
        maxTokensField: 'max_tokens',
      },
    }
  },
  streamOptions: (options) => options,
  classifyStreamError: (message, observation) =>
    classifyStreamError(
      message,
      observation,
      /json|parse|sse|chat completion|stream ended|unexpected end|invalid.*response/i,
    ),
}

const responsesAdapter: ProviderApiProtocolAdapter = {
  protocol: 'openai-responses',
  createApi: openAIResponsesApi,
  createModel(baseUrl, model) {
    return {
      ...commonModel('openai-responses', baseUrl, model),
      compat: {
        supportsDeveloperRole: false,
        supportsLongCacheRetention: false,
        supportsStrictMode: false,
        supportsReasoningEffort: (model.reasoningEfforts?.length ?? 0) > 0,
      },
    }
  },
  // 第三方 Responses 实现通常不支持 OpenAI 的会话缓存扩展字段。
  streamOptions: (options) => ({ ...options, cacheRetention: 'none' }),
  classifyStreamError: (message, observation) =>
    classifyStreamError(
      message,
      observation,
      /json|parse|sse|response\.(?:failed|incomplete)|responses stream ended|unexpected end|invalid.*response/i,
    ),
}

const protocolAdapters: Record<ProviderApiProtocol, ProviderApiProtocolAdapter> = {
  'openai-completions': completionsAdapter,
  'openai-responses': responsesAdapter,
}

// 协议选择只发生在此处，业务运行路径始终消费同一适配契约。
export function getProviderApiProtocolAdapter(
  protocol: ProviderApiProtocol,
): ProviderApiProtocolAdapter {
  const adapter = protocolAdapters[protocol]
  if (!adapter) {
    throw new AgentRuntimeError('INVALID_PAYLOAD', 'The Provider API protocol is invalid.')
  }
  return adapter
}
