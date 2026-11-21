/**
 * Agent 宿主与页面客户端之间的线上协议。
 *
 * 边界规则：业务对象一律复用 `contracts/ui.ts` 的视图类型，这里只新增
 * 「怎么过线」所需的消息信封，不重新描述会话、运行或工具的语义。
 */

import type { EntryId } from '@earendil-works/pi-durable'
import type { TSchema } from 'typebox'
import type {
  ProviderCatalogView,
  ProviderConnectionInput,
  ProviderModelView,
  ProviderReasoningEffort,
  ProviderSnapshot,
} from '../contracts/provider.js'
import type {
  AgentErrorView,
  AgentSessionView,
  AgentToolDebugResult,
  AgentToolView,
  AgentTranscriptView,
  AgentWorkspaceEvent,
  BranchMessageInput,
  ContinueRunInput,
  EditMessageInput,
  QuestionAnswerView,
  QuestionOptionView,
  StartRunInput,
} from '../contracts/ui.js'
import type { RuntimeToolResult, ToolEffect } from '../pi/types.js'

/** 线上协议版本；消息与语义同时变化时才递增。 */
export const AGENT_HOST_PROTOCOL_VERSION = 1 as const

/**
 * 图表工具的可序列化描述。
 *
 * 工具实现留在持有图表的页面，宿主只拿到「名字 / 说明 / 参数 Schema / 副作用」，
 * 用来组装运行计划；执行经 `tools.execute` 回到发起页。
 */
export interface ChartToolDescriptor {
  readonly name: string
  readonly label: string
  readonly description: string
  readonly effect: ToolEffect
  readonly parameters: TSchema
}

/** 一次运行所用的页面能力快照：图表工具描述随运行一起过线。 */
export interface AgentRunWireInput<TInput> {
  readonly input: TInput
  readonly tools: readonly ChartToolDescriptor[]
}

/** 页面可向宿主发起的调用；参数与结果与 `AgentBridgeClient`、`ProviderAdmin` 一一对应。 */
export interface AgentHostMethods {
  'sessions.list': { params: undefined; result: AgentSessionView[] }
  'sessions.open': {
    params: { sessionId: string }
    result: { transcript: AgentTranscriptView; leaseId: string }
  }
  /** 释放一次会话观察租约；最后一个租约释放后宿主关闭该会话的订阅。 */
  'sessions.release': { params: { leaseId: string }; result: undefined }
  'sessions.loadEarlier': { params: { sessionId: string }; result: AgentTranscriptView }
  'sessions.fillGap': {
    params: { sessionId: string; after: EntryId; upTo: EntryId }
    result: AgentTranscriptView
  }
  'sessions.create': { params: undefined; result: AgentSessionView }
  'sessions.rename': { params: { sessionId: string; title: string }; result: undefined }
  'sessions.delete': { params: { sessionId: string }; result: undefined }

  'runs.start': {
    params: AgentRunWireInput<StartRunInput>
    result: { runId: string; sessionId: string }
  }
  'runs.cancel': { params: { sessionId: string }; result: undefined }
  'runs.retry': {
    params: AgentRunWireInput<BranchMessageInput>
    result: { runId: string; sessionId: string }
  }
  'runs.continue': {
    params: AgentRunWireInput<ContinueRunInput>
    result: { runId: string; sessionId: string }
  }
  'runs.edit': {
    params: AgentRunWireInput<EditMessageInput>
    result: { runId: string; sessionId: string }
  }

  'provider.snapshot': { params: undefined; result: ProviderSnapshot }
  'provider.profile.create': { params: { name: string }; result: ProviderSnapshot }
  'provider.profile.rename': {
    params: { profileId: string; name: string }
    result: ProviderSnapshot
  }
  'provider.profile.delete': { params: { profileId: string }; result: ProviderSnapshot }
  'provider.profile.select': { params: { profileId: string }; result: ProviderSnapshot }
  'provider.connection.save': { params: ProviderConnectionInput; result: ProviderSnapshot }
  'provider.catalog': { params: { profileId: string }; result: ProviderCatalogView }
  'provider.model.add': {
    params: { profileId: string; model: ProviderModelView }
    result: ProviderSnapshot
  }
  'provider.model.remove': {
    params: { profileId: string; modelId: string }
    result: ProviderSnapshot
  }
  'provider.model.select': {
    params: { profileId: string; modelId: string }
    result: ProviderSnapshot
  }
  'provider.reasoningEffort': {
    params: { profileId: string; effort: ProviderReasoningEffort | undefined }
    result: ProviderSnapshot
  }
  'provider.exaKey': { params: { apiKey: string }; result: ProviderSnapshot }

  /** 宿主侧工具（Web 搜索、提问）的状态；页面再与本地图表工具合并成完整列表。 */
  'tools.list': { params: undefined; result: AgentHostToolState }
  'tools.setEnabled': {
    params: { name: string; enabled: boolean }
    result: undefined
  }
  'tools.debug': { params: { name: string; input: unknown }; result: AgentToolDebugResult }

  /** 把旧版 LocalStorage 文档一次性导入宿主存储；宿主只接受一次。 */
  'settings.importLegacy': { params: { document: unknown }; result: undefined }
}

/** 宿主侧工具状态：工具条目与被用户关闭的工具集合。 */
export interface AgentHostToolState {
  readonly hostTools: readonly AgentToolView[]
  readonly disabledTools: readonly string[]
}

export type AgentHostMethodName = keyof AgentHostMethods
export type AgentHostParams<K extends AgentHostMethodName> = AgentHostMethods[K]['params']
export type AgentHostResult<K extends AgentHostMethodName> = AgentHostMethods[K]['result']

/** 宿主可向页面发起的调用；结果回到宿主侧等待中的运行。 */
export interface AgentClientMethods {
  'tools.execute': {
    params: {
      toolName: string
      input: unknown
      sessionId: string
      runId: string
      toolCallId: string
    }
    result: RuntimeToolResult
  }
  'questions.ask': {
    params: {
      questionId: string
      sessionId: string
      toolCallId: string
      prompt: string
      options: readonly QuestionOptionView[]
      multiSelect: boolean
    }
    result: { status: 'answered'; answer: QuestionAnswerView } | { status: 'cancelled' }
  }
}

export type AgentClientMethodName = keyof AgentClientMethods
export type AgentClientParams<K extends AgentClientMethodName> = AgentClientMethods[K]['params']
export type AgentClientResult<K extends AgentClientMethodName> = AgentClientMethods[K]['result']

/** 宿主发给新接入页面的事件流。 */
export interface AgentEventNotification {
  readonly kind: 'event'
  readonly protocolVersion: typeof AGENT_HOST_PROTOCOL_VERSION
  readonly event: AgentWorkspaceEvent
}

/** 宿主撤销一次已经在页面上渲染的提问。 */
export interface AgentQuestionDismissNotification {
  readonly kind: 'question.dismiss'
  readonly protocolVersion: typeof AGENT_HOST_PROTOCOL_VERSION
  readonly questionId: string
}

/** 宿主撤销一次等待中的页面调用；页面据此中止本地执行。 */
export interface AgentCallCancelNotification {
  readonly kind: 'call.cancel'
  readonly protocolVersion: typeof AGENT_HOST_PROTOCOL_VERSION
  readonly requestId: string
}

export type AgentHostToClientNotification =
  | AgentEventNotification
  | AgentQuestionDismissNotification
  | AgentCallCancelNotification

/** 页面发给宿主的请求信封。 */
export type AgentHostRequest<K extends AgentHostMethodName = AgentHostMethodName> = {
  [M in K]: {
    readonly kind: 'request'
    readonly protocolVersion: typeof AGENT_HOST_PROTOCOL_VERSION
    readonly id: string
    readonly method: M
    readonly params: AgentHostParams<M>
  }
}[K]

/** 页面关闭前主动断开；宿主据此释放该页面的待办与运行归属。 */
export interface AgentDetachNotification {
  readonly kind: 'detach'
  readonly protocolVersion: typeof AGENT_HOST_PROTOCOL_VERSION
}

/** 宿主对页面请求的应答；失败时携带可展示的错误视图。 */
export type AgentHostResponse =
  | {
      readonly kind: 'response'
      readonly id: string
      readonly ok: true
      readonly result: unknown
    }
  | {
      readonly kind: 'response'
      readonly id: string
      readonly ok: false
      readonly error: AgentErrorView
    }

/** 宿主发给页面的调用信封。 */
export type AgentClientRequest<K extends AgentClientMethodName = AgentClientMethodName> = {
  [M in K]: {
    readonly kind: 'request'
    readonly protocolVersion: typeof AGENT_HOST_PROTOCOL_VERSION
    readonly id: string
    readonly method: M
    readonly params: AgentClientParams<M>
  }
}[K]

/** 页面对宿主调用的应答。 */
export type AgentClientResponse =
  | { readonly kind: 'response'; readonly id: string; readonly ok: true; readonly result: unknown }
  | {
      readonly kind: 'response'
      readonly id: string
      readonly ok: false
      readonly error: AgentErrorView
    }

/** 页面收到的全部宿主消息。 */
export type AgentHostMessage =
  | AgentHostResponse
  | AgentClientRequest
  | AgentHostToClientNotification

/** 宿主收到的全部页面消息。 */
export type AgentClientMessage = AgentHostRequest | AgentClientResponse | AgentDetachNotification

/** 判定值是否为普通对象，供入站消息校验使用。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** 校验页面消息信封；只检查信封字段，载荷由两端共享的类型声明约束。 */
export function isAgentClientMessage(value: unknown): value is AgentClientMessage {
  if (!isRecord(value)) return false
  if (value.kind === 'detach') return true
  if (typeof value.id !== 'string') return false
  if (value.kind === 'request') return typeof value.method === 'string'
  if (value.kind === 'response') return typeof value.ok === 'boolean'
  return false
}

/** 校验宿主消息信封；只检查信封字段，载荷由两端共享的类型声明约束。 */
export function isAgentHostMessage(value: unknown): value is AgentHostMessage {
  if (!isRecord(value)) return false
  if (value.kind === 'response')
    return typeof value.id === 'string' && typeof value.ok === 'boolean'
  if (value.kind === 'request')
    return typeof value.id === 'string' && typeof value.method === 'string'
  if (value.kind === 'event') return isRecord(value.event)
  if (value.kind === 'question.dismiss') return typeof value.questionId === 'string'
  if (value.kind === 'call.cancel') return typeof value.requestId === 'string'
  return false
}
