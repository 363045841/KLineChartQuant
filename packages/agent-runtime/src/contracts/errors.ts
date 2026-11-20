import type { AgentErrorView } from './ui.js'

export type AgentRuntimeErrorCode =
  | 'ABORTED'
  | 'DEADLINE_EXCEEDED'
  | 'DUPLICATE_REQUEST'
  | 'INTERNAL_ERROR'
  | 'INVALID_PAYLOAD'
  | 'INVALID_PROTOCOL'
  | 'PAYLOAD_TOO_LARGE'
  | 'PROVIDER_ERROR'
  | 'PROVIDER_AUTHENTICATION'
  | 'PROVIDER_PERMISSION'
  | 'PROVIDER_MODEL_NOT_FOUND'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_MALFORMED_RESPONSE'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'RUN_ACTIVE'
  | 'RUN_INTERRUPTED'
  | 'RUN_NOT_ACTIVE'
  | 'SESSION_CORRUPT'
  | 'SESSION_LOCKED'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_SCHEMA_UNSUPPORTED'
  | 'TARGET_LOST'
  | 'TARGET_MISMATCH'
  | 'TOOL_ERROR'
  | 'TOOL_INPUT_INVALID'
  | 'TOOL_NOT_ALLOWED'

export class AgentRuntimeError extends Error {
  readonly code: AgentRuntimeErrorCode
  readonly providerCode?: string
  readonly raw?: string
  readonly retryable: boolean
  readonly recommendedAction?: string

  constructor(
    code: AgentRuntimeErrorCode,
    message: string,
    options: {
      retryable?: boolean
      recommendedAction?: string
      providerCode?: string
      raw?: string
      cause?: unknown
    } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'AgentRuntimeError'
    this.code = code
    this.providerCode = options.providerCode
    this.raw = options.raw
    this.retryable = options.retryable ?? false
    this.recommendedAction = options.recommendedAction
  }

  toView(): AgentErrorView {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.providerCode === undefined ? {} : { providerCode: this.providerCode }),
      ...(this.raw === undefined ? {} : { raw: this.raw }),
      ...(this.recommendedAction === undefined
        ? {}
        : { recommendedAction: this.recommendedAction }),
    }
  }
}

export function toAgentRuntimeError(error: unknown): AgentRuntimeError {
  if (error instanceof AgentRuntimeError) return error
  return new AgentRuntimeError(
    'INTERNAL_ERROR',
    'The Agent runtime could not complete the request.',
    {
      retryable: true,
      recommendedAction: 'Retry the operation.',
      cause: error,
    },
  )
}

/**
 * 从错误视图恢复可抛出的运行时错误，保留错误码与可重试语义。
 *
 * 跨线程应答里的错误是视图结构，页面据此重建同类的错误实例。
 * @param view 序列化后的错误视图。
 * @returns 保留 code / retryable / recommendedAction 的错误实例。
 */
export function agentRuntimeErrorFromView(view: AgentErrorView): AgentRuntimeError {
  return new AgentRuntimeError(view.code as AgentRuntimeErrorCode, view.message, {
    retryable: view.retryable,
    ...(view.providerCode === undefined ? {} : { providerCode: view.providerCode }),
    ...(view.raw === undefined ? {} : { raw: view.raw }),
    ...(view.recommendedAction === undefined ? {} : { recommendedAction: view.recommendedAction }),
  })
}
