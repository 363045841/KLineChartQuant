// OpenAI-compatible Provider 的运行时配置、存储边界与诊断数据契约。

/** OpenAI-compatible Provider 的稳定标识。 */
import type { ProviderApiProtocol } from '../contracts/ui.js'

export const OPENAI_COMPATIBLE_PROVIDER_ID = 'openai-compatible'
/** 在 UI 中展示的 Provider 名称。 */
export const OPENAI_COMPATIBLE_PROVIDER_LABEL = 'OpenAI-compatible'
/** 已持久化 Provider 设置的当前数据版本。 */
export const PROVIDER_SETTINGS_VERSION = 2 as const

/**
 * 定义 Provider API Key 的持久化边界。
 *
 * 实现方负责凭据的安全存储，并在每次 I/O 前响应取消信号。
 */
export interface ProviderCredentialStore {
  /** 读取当前 API Key；未配置时返回 undefined。 */
  read(signal?: AbortSignal): Promise<string | undefined>
  /** 写入 API Key。 */
  write(apiKey: string, signal?: AbortSignal): Promise<void>
  /** 删除已保存的 API Key。 */
  delete(signal?: AbortSignal): Promise<void>
}

/** OpenAI-compatible Provider 的已验证连接设置。 */
export interface OpenAiCompatibleProviderSettings {
  /** 用于兼容后续迁移的持久化数据版本。 */
  version: typeof PROVIDER_SETTINGS_VERSION
  /** 不含末尾斜杠的 Provider API 根地址。 */
  baseUrl: string
  /** 已验证的模型 ID。 */
  modelId: string
  /** 用于界面展示的模型名称。 */
  modelName: string
  protocol: ProviderApiProtocol
  compatibility: 'compatible'
  /** 最近一次成功验证连接的时间戳。 */
  lastTestedAt: number
  /** 最近一次刷新模型目录的时间戳。 */
  lastModelsRefreshAt: number
}

/** 定义 Provider 非敏感设置的持久化边界。 */
export interface ProviderSettingsStore {
  /** 读取设置；尚未配置时返回 undefined。 */
  read(signal?: AbortSignal): Promise<OpenAiCompatibleProviderSettings | undefined>
  /** 原子写入已验证的 Provider 设置。 */
  write(settings: OpenAiCompatibleProviderSettings, signal?: AbortSignal): Promise<void>
}

/** 单个 Provider HTTP 或流式请求阶段的脱敏诊断记录。 */
export interface ProviderDiagnostic {
  /** 当前诊断所处的请求生命周期阶段。 */
  phase: 'request' | 'response' | 'retry' | 'failure' | 'validation'
  /** 请求 HTTP 方法。 */
  method: string
  /** 已移除认证与查询参数的请求地址。 */
  url: string
  /** 从 1 开始计数的请求尝试次数。 */
  attempt: number
  /** 响应状态码。 */
  status?: number
  /** 响应 Content-Type。 */
  contentType?: string
  /** 本次请求耗时。 */
  durationMs?: number
  /** 归一化后的 Agent 运行时错误码。 */
  code?: string
  /** 发起请求的 Agent 流程阶段。 */
  stage?: 'catalog' | 'text' | 'tool' | 'stream'
  /** 无法解析的响应体字节数。 */
  responseBodyBytes?: number
  /** 无法解析的响应体外形，用于排查协议不兼容。 */
  responseBodyShape?: 'empty' | 'json-like' | 'sse' | 'html' | 'other'
}

/** 创建 OpenAI-compatible 运行时支持对象所需的可注入依赖。 */
export interface OpenAiCompatibleRuntimeOptions {
  /** API Key 存储实现。 */
  credentials: ProviderCredentialStore
  /** Provider 设置存储实现。 */
  settings: ProviderSettingsStore
  /** 可替换的 fetch 实现，便于宿主适配和测试。 */
  fetch?: typeof globalThis.fetch
  /** 时钟函数，便于测试稳定的时间相关行为。 */
  now?: () => number
  /** 可取消的延时函数，用于 HTTP 重试等待。 */
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>
  /** 单次 HTTP 请求超时时间。 */
  requestTimeoutMs?: number
  /** 可重试请求的最大重试次数。 */
  maxRetries?: number
  /** 服务端 Retry-After 的最大等待上限。 */
  maxRetryDelayMs?: number
  /** 接收不含凭据的 Provider 请求诊断信息。 */
  diagnostics?: (diagnostic: ProviderDiagnostic) => void
  /** 根据当前运行上下文提供可用的只读工具。 */
  tools?: (context: {
    readonly sessionId: string
    readonly runId: string
    readonly turnId: string
    readonly prompt: string
    readonly readOnly: boolean
  }) => readonly import('../pi/types.js').RuntimeToolDefinition[]
}
