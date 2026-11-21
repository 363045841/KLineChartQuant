/**
 * 页面侧 Agent 客户端：把 UI 调用翻译成宿主请求，并把宿主事件与页面能力请求
 * 分发给本地订阅者与图表工具执行器。
 *
 * 这里没有任何业务状态：会话、模型、Provider 与提问登记都在宿主。
 */

import type { EntryId } from '@earendil-works/pi-durable'
import {
  AgentRuntimeError,
  agentRuntimeErrorFromView,
  toAgentRuntimeError,
} from '../contracts/errors.js'
import type {
  AgentHostClientApi,
  AgentToolDebugResult,
  AgentToolView,
  AgentWorkspaceEvent,
  BranchMessageInput,
  ContinueRunInput,
  EditMessageInput,
  ProviderModelPoolEntry,
  ProviderModelsResult,
  ProviderModelView,
  ProviderProfileView,
  ProviderReasoningEffort,
  ProviderSaveInput,
  ProviderStatusView,
  QuestionAnswerView,
  QuestionView,
  StartRunInput,
} from '../contracts/ui.js'
import { AGENT_UI_PROTOCOL_VERSION } from '../contracts/ui.js'
import {
  AGENT_HOST_PROTOCOL_VERSION,
  type AgentClientRequest,
  type AgentHostMessage,
  type AgentHostMethodName,
  type AgentHostParams,
  type AgentHostRequest,
  type AgentHostResult,
} from '../host/protocol.js'
import type { RuntimeToolResult } from '../pi/types.js'
import type { AgentClientToolHost, AgentHostTransport } from './types.js'

/** 等待宿主应答的调用。 */
interface PendingHostCall {
  readonly resolve: (result: unknown) => void
  readonly reject: (error: unknown) => void
}

/** 页面上等待用户作答的宿主提问。 */
interface PendingQuestion {
  readonly requestId: string
  readonly sessionId: string
}

/** 宿主客户端：实现 UI 需要的桥接口，同时处理宿主回路由的页面能力请求。 */
export type AgentHostClient = AgentHostClientApi

/** 创建客户端所需的依赖。 */
export interface AgentHostClientOptions {
  /** 页面与宿主之间的传输端口；客户端在构造时接管订阅与错误处理。 */
  readonly transport: AgentHostTransport
  /** 图表工具的执行端口，由页面在绑定图表后提供。 */
  readonly toolHost: AgentClientToolHost
  /** 请求标识生成器；默认使用 `crypto.randomUUID`。 */
  readonly createId?: () => string
}

/**
 * 创建页面侧 Agent 客户端。
 * @param options 传输端口、页面能力端口与标识生成器。
 * @returns 与 UI 交互的桥接口。
 */
export function createAgentHostClient(options: AgentHostClientOptions): AgentHostClient {
  const transport = options.transport
  const createId = options.createId ?? (() => crypto.randomUUID())
  const listeners = new Set<(event: AgentWorkspaceEvent) => void>()
  const pendingCalls = new Map<string, PendingHostCall>()
  const pendingQuestions = new Map<string, PendingQuestion>()
  const runningTools = new Map<string, AbortController>()

  /** 发送一次宿主调用并等待应答。 */
  function call<K extends AgentHostMethodName>(
    method: K,
    params: AgentHostParams<K>,
  ): Promise<AgentHostResult<K>> {
    const id = createId()
    return new Promise<AgentHostResult<K>>((resolve, reject) => {
      // 序列化边界：泛型方法名无法让编译器把 params 收窄到对应成员，
      // 两端构造与消费使用同一份协议类型。
      const request = {
        kind: 'request',
        protocolVersion: AGENT_HOST_PROTOCOL_VERSION,
        id,
        method,
        params,
      } as AgentHostRequest
      // 序列化边界：应答体由同一份代码在另一端构造，按声明的结果类型消费。
      pendingCalls.set(id, { resolve: (value) => resolve(value as AgentHostResult<K>), reject })
      transport.post(request)
    })
  }

  /** 把事件交给所有本地订阅者。 */
  function emit(event: AgentWorkspaceEvent): void {
    for (const listener of listeners) listener(event)
  }

  /** 页面侧提问的展示与结算都走同一份工作区事件。 */
  function emitQuestion(question: QuestionView, sessionId: string): void {
    emit({
      protocolVersion: AGENT_UI_PROTOCOL_VERSION,
      type: 'tool.question.required',
      sessionId,
      request: question,
    })
  }

  /** 结算一次提问，并回应宿主的等待。 */
  function settleQuestion(
    questionId: string,
    outcome: { status: 'answered'; answer: QuestionAnswerView } | { status: 'cancelled' },
  ): void {
    const pending = pendingQuestions.get(questionId)
    if (!pending) return
    pendingQuestions.delete(questionId)
    transport.post({
      kind: 'response',
      id: pending.requestId,
      ok: true,
      result: outcome,
    })
    emit({
      protocolVersion: AGENT_UI_PROTOCOL_VERSION,
      type: 'tool.question.resolved',
      sessionId: pending.sessionId,
      questionId,
      status: outcome.status,
      ...(outcome.status === 'answered' ? { answer: outcome.answer } : {}),
    })
  }

  /** 执行页面声明的图表工具；未知工具明确失败，不做降级。 */
  async function executeChartTool(
    toolName: string,
    input: unknown,
    context: { sessionId: string; runId: string; toolCallId: string; signal: AbortSignal },
  ): Promise<RuntimeToolResult> {
    return options.toolHost.execute({ toolName, input, ...context })
  }

  /** 处理宿主发起的页面能力调用。 */
  async function handleClientRequest(request: AgentClientRequest): Promise<void> {
    try {
      if (request.method === 'tools.execute') {
        const controller = new AbortController()
        runningTools.set(request.id, controller)
        try {
          const result = await executeChartTool(request.params.toolName, request.params.input, {
            ...request.params,
            signal: controller.signal,
          })
          transport.post({ kind: 'response', id: request.id, ok: true, result })
        } finally {
          runningTools.delete(request.id)
        }
        return
      }
      if (pendingQuestions.has(request.params.questionId)) {
        throw new AgentRuntimeError('DUPLICATE_REQUEST', 'The Agent question is already open.')
      }
      pendingQuestions.set(request.params.questionId, {
        requestId: request.id,
        sessionId: request.params.sessionId,
      })
      emitQuestion(
        {
          id: request.params.questionId,
          toolCallId: request.params.toolCallId,
          prompt: request.params.prompt,
          options: request.params.options,
          multiSelect: request.params.multiSelect,
          status: 'pending',
        },
        request.params.sessionId,
      )
    } catch (error) {
      transport.post({
        kind: 'response',
        id: request.id,
        ok: false,
        error: toAgentRuntimeError(error).toView(),
      })
    }
  }

  /** 处理宿主消息：应答、页面调用、事件、撤销与取消。 */
  function receive(message: AgentHostMessage): void {
    if (message.kind === 'response') {
      const pending = pendingCalls.get(message.id)
      if (!pending) return
      pendingCalls.delete(message.id)
      if (message.ok) pending.resolve(message.result)
      else pending.reject(agentRuntimeErrorFromView(message.error))
      return
    }
    if (message.kind === 'event') {
      emit(message.event)
      return
    }
    if (message.kind === 'call.cancel') {
      runningTools.get(message.requestId)?.abort()
      return
    }
    if (message.kind === 'question.dismiss') {
      const pending = pendingQuestions.get(message.questionId)
      if (!pending) return
      pendingQuestions.delete(message.questionId)
      transport.post({
        kind: 'response',
        id: pending.requestId,
        ok: true,
        result: { status: 'cancelled' },
      })
      emit({
        protocolVersion: AGENT_UI_PROTOCOL_VERSION,
        type: 'tool.question.resolved',
        sessionId: pending.sessionId,
        questionId: message.questionId,
        status: 'cancelled',
      })
      return
    }
    void handleClientRequest(message)
  }

  /** 传输层不可恢复时，所有待办统一失败，不留下永久等待的调用。 */
  function fail(error: AgentRuntimeError): void {
    for (const [id, pending] of pendingCalls) {
      pendingCalls.delete(id)
      pending.reject(error)
    }
  }

  // 端口由客户端自持：订阅与错误挂接在构造时一次完成，创建方无需再补任何一步。
  transport.subscribe(receive)
  transport.onError(fail)

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    listSessions: () => call('sessions.list', undefined),
    openSession: async (sessionId: string) => {
      const { transcript, leaseId } = await call('sessions.open', { sessionId })
      return {
        sessionId,
        transcript,
        release: async () => {
          await call('sessions.release', { leaseId })
        },
      }
    },
    loadEarlier: (sessionId) => call('sessions.loadEarlier', { sessionId }),
    fillGap: (sessionId: string, after: EntryId, upTo: EntryId) =>
      call('sessions.fillGap', { sessionId, after, upTo }),
    createSession: () => call('sessions.create', undefined),
    renameSession: (sessionId: string, title: string) =>
      call('sessions.rename', { sessionId, title }),
    deleteSession: (sessionId: string) => call('sessions.delete', { sessionId }),
    startRun: (input: StartRunInput) =>
      call('runs.start', { input, tools: options.toolHost.catalog() }),
    cancelRun: (sessionId: string) => call('runs.cancel', { sessionId }),
    retryRun: (input: BranchMessageInput) =>
      call('runs.retry', { input, tools: options.toolHost.catalog() }),
    continueRun: (input: ContinueRunInput) =>
      call('runs.continue', { input, tools: options.toolHost.catalog() }),
    editMessage: (input: EditMessageInput) =>
      call('runs.edit', { input, tools: options.toolHost.catalog() }),
    getProviderStatus: () => call('provider.status', undefined),
    listProviderProfiles: () => call('provider.profiles', undefined),
    createProviderProfile: (profileName: string) =>
      call('provider.profile.create', { profileName }),
    renameProviderProfile: (profileName: string, nextProfileName: string) =>
      call('provider.profile.rename', { profileName, nextProfileName }),
    deleteProviderProfile: (profileName: string) =>
      call('provider.profile.delete', { profileName }),
    selectProviderProfile: (profileName: string) =>
      call('provider.profile.select', { profileName }),
    saveProvider: (input: ProviderSaveInput) => call('provider.profile.save', input),
    setProviderReasoningEffort: (effort: ProviderReasoningEffort | undefined) =>
      call('provider.reasoningEffort', { effort }),
    deleteProviderCredential: () => call('provider.credential.delete', undefined),
    saveWebSearchApiKey: (apiKey: string) => call('provider.webSearchKey', { apiKey }),
    listProviderModelCatalog: () => call('provider.modelCatalog', undefined),
    listProviderModelPool: () => call('provider.modelPool', undefined),
    addProviderModelPoolModel: (model: ProviderModelView) =>
      call('provider.modelPool.add', { model }),
    removeProviderModelPoolModel: (modelId: string) =>
      call('provider.modelPool.remove', { modelId }),
    setProviderModel: (modelId: string) => call('provider.model.select', { modelId }),

    /** 图表工具与宿主工具合并成一份可配置清单。 */
    async listTools(): Promise<AgentToolView[]> {
      const state = await call('tools.list', undefined)
      const chartTools = options.toolHost.metadata().map((tool) => ({
        name: tool.name,
        label: tool.label,
        description: tool.description,
        enabled: !state.disabledTools.includes(tool.name),
      }))
      return [...chartTools, ...state.hostTools]
    },

    /** 工具启用状态由宿主持久化为禁用集合。 */
    async setToolEnabled(name: string, enabled: boolean): Promise<void> {
      await call('tools.setEnabled', { name, enabled })
    },

    /** 图表工具在页面执行，宿主工具回宿主执行。 */
    async debugTool(name: string, input: unknown): Promise<AgentToolDebugResult> {
      const isChartTool = options.toolHost.metadata().some((tool) => tool.name === name)
      if (!isChartTool) return call('tools.debug', { name, input })
      const result = await executeChartTool(name, input, {
        sessionId: 'debug',
        runId: `debug:${createId()}`,
        toolCallId: `debug:${createId()}`,
        signal: new AbortController().signal,
      })
      return { content: result.content, summary: result.summary }
    },

    answerQuestion(questionId: string, answer: QuestionAnswerView): Promise<void> {
      settleQuestion(questionId, { status: 'answered', answer })
      return Promise.resolve()
    },

    cancelQuestion(questionId: string): Promise<void> {
      settleQuestion(questionId, { status: 'cancelled' })
      return Promise.resolve()
    },

    importLegacy: (document: unknown) => call('settings.importLegacy', { document }),
  }
}
