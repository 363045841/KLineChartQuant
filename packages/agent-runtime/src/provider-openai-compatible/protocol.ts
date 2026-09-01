// OpenAI-compatible 协议适配边界：集中协议元数据、探针与流错误分类。
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy'

import { AgentRuntimeError } from '../contracts/errors.js'

import { providerHttpError, requestProviderJson } from './http.js'
import { OPENAI_COMPATIBLE_PROVIDER_ID, type ProviderDiagnostic } from './types.js'

import type { ProviderHttpOptions } from './http.js'
import type { AgentRuntimeErrorCode } from '../contracts/errors.js'
import type { ProviderApiProtocol } from '../contracts/ui.js'
import type {
  AssistantMessage,
  Model,
  ProviderStreams,
  SimpleStreamOptions,
} from '@earendil-works/pi-ai'

const DEFAULT_CONTEXT_WINDOW = 32_768
// 推理模型在 Responses 协议里 max_output_tokens 是思考与正文的共享总预算；
// 过低会导致长链思考耗尽预算后被截断，正文一个字都产不出。
const DEFAULT_MAX_TOKENS = 16_384
const PROBE_MAX_TOKENS = 32
const PROBE_TEXT = 'KLC_PROVIDER_OK'
const PROBE_TOOL_NAME = 'klinechartquant_connection_probe'

export interface ProviderCatalogModel {
  id: string
  name: string
}

export interface ProviderStreamObservation {
  status?: number
  retryAfterMs?: number
  networkFailure: boolean
}

interface ProviderProbeInput {
  baseUrl: string
  apiKey: string
  modelId: string
  http: ProviderHttpOptions
}

interface ProviderToolProbeInput extends ProviderProbeInput {
  nonce: string
}

export interface ProviderApiProtocolAdapter {
  readonly protocol: ProviderApiProtocol
  createApi(): ProviderStreams
  createModel(baseUrl: string, model: ProviderCatalogModel): Model<ProviderApiProtocol>
  probeText(input: ProviderProbeInput): Promise<void>
  probeTool(input: ProviderToolProbeInput): Promise<void>
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

// 生成不含业务数据的函数参数约束，探针只验证协议能力。
function probeParameters(nonce: string): Record<string, unknown> {
  return {
    type: 'object',
    properties: { nonce: { type: 'string', const: nonce } },
    required: ['nonce'],
    additionalProperties: false,
  }
}

// 所有协议共用相同 HTTP 安全边界，仅请求路径和载荷由适配器提供。
async function postProbe(
  input: ProviderProbeInput,
  path: string,
  body: Record<string, unknown>,
  stage: ProviderDiagnostic['stage'],
): Promise<unknown> {
  const result = await requestProviderJson(
    `${input.baseUrl}${path}`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    { ...input.http, stage },
  )
  return result.value
}

// 文本探针只要求非空内容，不依赖模型对固定措辞的遵循程度。
function requireText(value: unknown): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw malformedResponse()
  }
}

// 工具探针必须回传同名函数与逐请求 nonce，避免仅凭普通文本误判兼容。
function requireToolCall(name: unknown, rawArguments: unknown, nonce: string): void {
  if (name !== PROBE_TOOL_NAME || typeof rawArguments !== 'string') {
    throw incompatibleTools()
  }
  try {
    const args = JSON.parse(rawArguments) as unknown
    if (!isRecord(args) || args.nonce !== nonce) throw incompatibleTools()
  } catch (error) {
    if (error instanceof AgentRuntimeError) throw error
    throw incompatibleTools()
  }
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

// 创建工具协议不兼容错误，供 UI 引导用户更换模型。
function incompatibleTools(): AgentRuntimeError {
  return new AgentRuntimeError(
    'PROVIDER_INCOMPATIBLE_TOOLS',
    'The Provider did not return the required harmless tool call.',
    {
      recommendedAction: 'Select a model with function tool support.',
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
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: DEFAULT_MAX_TOKENS,
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
        supportsReasoningEffort: false,
        supportsUsageInStreaming: false,
        maxTokensField: 'max_tokens',
      },
    }
  },
  async probeText(input) {
    const value = await postProbe(
      input,
      '/chat/completions',
      {
        model: input.modelId,
        messages: [{ role: 'user', content: `Reply with exactly ${PROBE_TEXT}.` }],
        max_tokens: PROBE_MAX_TOKENS,
        stream: false,
      },
      'text',
    )
    if (!isRecord(value) || !Array.isArray(value.choices) || !isRecord(value.choices[0])) {
      throw malformedResponse()
    }
    const message = value.choices[0].message
    if (!isRecord(message)) throw malformedResponse()
    requireText(message.content)
  },
  async probeTool(input) {
    const value = await postProbe(
      input,
      '/chat/completions',
      {
        model: input.modelId,
        messages: [
          {
            role: 'user',
            content: `Call ${PROBE_TOOL_NAME} once with nonce ${input.nonce}.`,
          },
        ],
        max_tokens: PROBE_MAX_TOKENS,
        stream: false,
        tools: [
          {
            type: 'function',
            function: {
              name: PROBE_TOOL_NAME,
              description: 'Validates function calling without side effects.',
              parameters: probeParameters(input.nonce),
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: PROBE_TOOL_NAME } },
      },
      'tool',
    )
    if (!isRecord(value) || !Array.isArray(value.choices) || !isRecord(value.choices[0])) {
      throw incompatibleTools()
    }
    const message = value.choices[0].message
    if (!isRecord(message) || !Array.isArray(message.tool_calls)) throw incompatibleTools()
    if (message.tool_calls.length !== 1) throw incompatibleTools()
    const call = message.tool_calls[0]
    if (!isRecord(call) || !isRecord(call.function)) throw incompatibleTools()
    requireToolCall(call.function.name, call.function.arguments, input.nonce)
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
      },
    }
  },
  async probeText(input) {
    const value = await postProbe(
      input,
      '/responses',
      {
        model: input.modelId,
        input: `Reply with exactly ${PROBE_TEXT}.`,
        max_output_tokens: PROBE_MAX_TOKENS,
        store: false,
        stream: false,
      },
      'text',
    )
    if (!isRecord(value)) throw malformedResponse()
    if (typeof value.output_text === 'string') {
      requireText(value.output_text)
      return
    }
    if (!Array.isArray(value.output)) throw malformedResponse()
    const text = value.output.flatMap((item) => {
      if (!isRecord(item) || !Array.isArray(item.content)) return []
      return item.content.flatMap((content) =>
        isRecord(content) && content.type === 'output_text' ? [content.text] : [],
      )
    })[0]
    requireText(text)
  },
  async probeTool(input) {
    const value = await postProbe(
      input,
      '/responses',
      {
        model: input.modelId,
        input: `Call ${PROBE_TOOL_NAME} once with nonce ${input.nonce}.`,
        max_output_tokens: PROBE_MAX_TOKENS,
        store: false,
        stream: false,
        tools: [
          {
            type: 'function',
            name: PROBE_TOOL_NAME,
            description: 'Validates function calling without side effects.',
            parameters: probeParameters(input.nonce),
          },
        ],
        tool_choice: { type: 'function', name: PROBE_TOOL_NAME },
      },
      'tool',
    )
    if (!isRecord(value) || !Array.isArray(value.output)) throw incompatibleTools()
    const calls = value.output.filter(
      (item): item is Record<string, unknown> => isRecord(item) && item.type === 'function_call',
    )
    if (calls.length !== 1) throw incompatibleTools()
    const call = calls[0]
    requireToolCall(call?.name, call?.arguments, input.nonce)
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
