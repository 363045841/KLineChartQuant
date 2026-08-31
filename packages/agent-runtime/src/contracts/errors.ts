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
  | 'PROVIDER_INCOMPATIBLE_TOOLS'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'RUN_ACTIVE'
  | 'RUN_INTERRUPTED'
  | 'RUN_NOT_ACTIVE'
  | 'SESSION_CORRUPT'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_SCHEMA_UNSUPPORTED'
  | 'TARGET_LOST'
  | 'TARGET_MISMATCH'
  | 'TOOL_ERROR'
  | 'TOOL_LOOP_LIMIT'
  | 'TOOL_NOT_ALLOWED'

export class AgentRuntimeError extends Error {
  readonly code: AgentRuntimeErrorCode
  readonly retryable: boolean
  readonly recommendedAction?: string

  constructor(
    code: AgentRuntimeErrorCode,
    message: string,
    options: { retryable?: boolean; recommendedAction?: string; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'AgentRuntimeError'
    this.code = code
    this.retryable = options.retryable ?? false
    this.recommendedAction = options.recommendedAction
  }

  toView(): AgentErrorView {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      recommendedAction: this.recommendedAction,
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
