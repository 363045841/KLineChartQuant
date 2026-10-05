// 本文件校验从持久化 JSON 读取的 UI 事件。
import { AgentRuntimeError } from '../contracts/errors.js'
import { AGENT_UI_PROTOCOL_VERSION, type AgentUiEvent } from '../contracts/ui.js'

/** 判断普通 JSON 对象。 */
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 检查指定字段是否均为字符串。 */
function strings(value: Record<string, unknown>, ...keys: string[]): boolean {
  return keys.every((key) => typeof value[key] === 'string')
}

/** 校验稳定错误视图的必需字段。 */
function error(value: unknown): boolean {
  return object(value) && strings(value, 'code', 'message') && typeof value.retryable === 'boolean'
}

/** 校验消息的必需字段和角色。 */
function message(value: unknown): boolean {
  return (
    object(value) &&
    strings(value, 'id', 'content') &&
    typeof value.createdAt === 'number' &&
    ['user', 'assistant', 'action', 'reasoning'].includes(String(value.role))
  )
}

/** 校验工具调用的必需字段与枚举。 */
function tool(value: unknown): boolean {
  return (
    object(value) &&
    strings(value, 'id', 'runId', 'name', 'label', 'inputSummary') &&
    typeof value.reversible === 'boolean' &&
    ['read-only', 'reversible-write', 'destructive'].includes(String(value.safety)) &&
    [
      'queued',
      'running',
      'requires-confirmation',
      'succeeded',
      'failed',
      'cancelled',
      'rejected',
      'undone',
    ].includes(String(value.status))
  )
}

/** 校验来源引用列表。 */
function citations(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.every((item) => object(item) && strings(item, 'id', 'title', 'url', 'snippet')))
  )
}

/** 校验可回放运行事件的判别字段与对应载荷。 */
function isEvent(value: unknown): value is AgentUiEvent {
  if (
    !object(value) ||
    value.protocolVersion !== AGENT_UI_PROTOCOL_VERSION ||
    !strings(value, 'type', 'runId', 'sessionId')
  )
    return false
  if (value.sequence !== undefined && typeof value.sequence !== 'number') return false
  switch (value.type) {
    case 'run.started':
      return typeof value.startedAt === 'number'
    case 'run.cancelling':
      return true
    case 'run.cancelled':
      return typeof value.partial === 'boolean' && typeof value.endedAt === 'number'
    case 'run.completed':
      return typeof value.endedAt === 'number' && (value.usage === undefined || object(value.usage))
    case 'run.failed':
    case 'run.interrupted':
      return typeof value.endedAt === 'number' && error(value.error)
    case 'user.message.created':
    case 'action.summary':
      return message(value.message)
    case 'assistant.message.started':
    case 'assistant.thinking.started':
      return strings(value, 'messageId') && typeof value.createdAt === 'number'
    case 'assistant.text.delta':
    case 'assistant.thinking.delta':
      return strings(value, 'messageId', 'delta')
    case 'assistant.message.completed':
      return strings(value, 'messageId') && citations(value.citations)
    case 'assistant.message.failed':
    case 'assistant.thinking.completed':
      return strings(value, 'messageId')
    case 'tool.started':
      return tool(value.call)
    case 'tool.finished':
      return tool(value.result)
    case 'tool.progress':
      return (
        strings(value, 'toolCallId') && object(value.progress) && strings(value.progress, 'label')
      )
    case 'tool.undone':
      return strings(value, 'toolCallId') && typeof value.undoneAt === 'number'
    case 'tool.confirmation.required':
      return (
        object(value.request) &&
        strings(value.request, 'id', 'toolCallId', 'title', 'description', 'impact') &&
        typeof value.request.reversible === 'boolean' &&
        typeof value.request.expiresAt === 'number' &&
        ['pending', 'confirmed', 'rejected', 'expired'].includes(String(value.request.status))
      )
    case 'tool.confirmation.resolved':
      return (
        strings(value, 'confirmationId') &&
        ['confirmed', 'rejected'].includes(String(value.decision))
      )
    case 'tool.question.required':
      return (
        object(value.request) &&
        strings(value.request, 'id', 'toolCallId', 'prompt') &&
        typeof value.request.multiSelect === 'boolean' &&
        ['pending', 'answered', 'cancelled'].includes(String(value.request.status)) &&
        Array.isArray(value.request.options) &&
        value.request.options.every((option) => object(option) && strings(option, 'value', 'label'))
      )
    case 'tool.question.resolved':
      return (
        strings(value, 'questionId') &&
        ['answered', 'cancelled'].includes(String(value.status)) &&
        (value.answer === undefined ||
          (object(value.answer) &&
            Array.isArray(value.answer.selectedValues) &&
            value.answer.selectedValues.every((item) => typeof item === 'string')))
      )
    default:
      return false
  }
}

/** 解码持久化运行事件，损坏或未知协议直接报错。 */
export function decodeAgentUiEvent(value: unknown): AgentUiEvent {
  if (isEvent(value)) return value
  throw new AgentRuntimeError('SESSION_CORRUPT', 'The Agent event checkpoint is invalid.')
}
