// Pi Agent 驱动器：执行运行计划、投影 UI 事件并隔离敏感内容。
import { Agent, type AgentEvent, type AgentTool } from '@earendil-works/pi-agent-core'

import { AgentRuntimeError, toAgentRuntimeError } from '../contracts/errors.js'
import { redactString, redactValue, type RedactionOptions } from '../security/redaction.js'

import type {
  PiRunEventSink,
  PiRunPlan,
  PiRunResult,
  RuntimeToolDefinition,
  RuntimeToolResult,
} from './types.js'
import type { AgentUsageView, ToolCallView, ToolProgressView } from '../contracts/ui.js'
import type { AssistantMessage, Usage } from '@earendil-works/pi-ai'

const DEFAULT_TOOL_TURN_LIMIT = 8
const HARD_TOOL_TURN_LIMIT = 12
const DEFAULT_TIMEOUT_MS = 30_000

/** 判断 Pi 消息是否为助手消息，供事件投影和错误分类使用。 */
function isAssistant(message: unknown): message is AssistantMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'role' in message &&
    message.role === 'assistant'
  )
}

/**
 * 将 Pi 原始用量转换为 UI 用量视图。
 * @param usage Pi 返回的令牌与成本用量。
 * @param startedAt 运行开始时间。
 * @param now 当前时间。
 * @returns 聚合后的 UI 用量。
 */
function usageView(usage: Usage, startedAt: number, now: number): AgentUsageView {
  return {
    inputTokens: usage.input + usage.cacheRead,
    outputTokens: usage.output,
    costUsd: usage.cost.total,
    durationMs: Math.max(0, now - startedAt),
  }
}

/**
 * 累加两次 Pi 模型用量。
 * @param total 之前已累积的用量。
 * @param next 新收到的单次消息用量。
 * @returns 新的独立累计用量。
 */
function addUsage(total: Usage | undefined, next: Usage): Usage {
  if (!total) return structuredClone(next)
  return {
    input: total.input + next.input,
    output: total.output + next.output,
    cacheRead: total.cacheRead + next.cacheRead,
    cacheWrite: total.cacheWrite + next.cacheWrite,
    totalTokens: total.totalTokens + next.totalTokens,
    cost: {
      input: total.cost.input + next.cost.input,
      output: total.cost.output + next.cost.output,
      cacheRead: total.cost.cacheRead + next.cost.cacheRead,
      cacheWrite: total.cost.cacheWrite + next.cost.cacheWrite,
      total: total.cost.total + next.cost.total,
    },
  }
}

/**
 * 将 Pi 内部工具调用 ID 命名空间化，避免跨运行冲突。
 * @param runId 当前运行 ID。
 * @param rawId Pi 分配的原始工具调用 ID。
 * @returns 可公开传递给 UI 的工具调用 ID。
 */
function publicToolCallId(runId: string, rawId: string): string {
  return `${encodeURIComponent(runId)}:${encodeURIComponent(rawId)}`
}

/**
 * 从 Pi 部分工具结果中提取安全的进度视图。
 * @param value Pi 提供的未知详情值。
 * @returns 合法进度；结构不完整时返回 undefined。
 */
function safeProgress(value: unknown): ToolProgressView | undefined {
  if (typeof value !== 'object' || value === null || !('progress' in value)) return undefined
  const progress = value.progress
  if (
    typeof progress !== 'object' ||
    progress === null ||
    !('label' in progress) ||
    typeof progress.label !== 'string'
  )
    return undefined
  return {
    label: progress.label,
    current:
      'current' in progress && typeof progress.current === 'number' ? progress.current : undefined,
    total: 'total' in progress && typeof progress.total === 'number' ? progress.total : undefined,
  }
}

/** Pi 驱动器的可注入运行时依赖。 */
export interface PiRunDriverOptions {
  /** 时钟函数，用于测试与事件时间戳。 */
  now?: () => number
  /** 消息 ID 生成器，用于测试稳定事件。 */
  id?: () => string
  /** 需要在事件和工具结果中移除的敏感值配置。 */
  redaction?: RedactionOptions
}

/** 负责串行执行一个 Pi Agent 运行计划的运行驱动器。 */
export class PiRunDriver {
  private readonly now: () => number
  private readonly id: () => string
  private readonly redaction: RedactionOptions
  private activeAgent: Agent | undefined

  /**
   * 创建 Pi 驱动器。
   * @param options 可选的时间、ID 与脱敏依赖。
   */
  constructor(options: PiRunDriverOptions = {}) {
    this.now = options.now ?? Date.now
    this.id = options.id ?? (() => globalThis.crypto.randomUUID())
    this.redaction = options.redaction ?? {}
  }

  /** 取消当前活动的 Pi Agent 运行；空闲时无操作。 */
  abort(): void {
    this.activeAgent?.abort()
  }

  /** 等待当前活动运行停止；空闲时立即完成。 */
  async waitForIdle(): Promise<void> {
    await this.activeAgent?.waitForIdle()
  }

  /**
   * 执行运行计划，并把 Pi 事件投影为稳定的 Agent UI 事件。
   * @param plan 本次运行的模型、工具和超时计划。
   * @param emit 接收 UI 事件的同步或异步函数。
   * @returns 助手文本、聚合用量与成功工具数。
   * @throws {AgentRuntimeError} 并发运行、超时、取消、工具循环或 Provider 失败时抛出。
   */
  async run(plan: PiRunPlan, emit: PiRunEventSink): Promise<PiRunResult> {
    if (this.activeAgent)
      throw new AgentRuntimeError('RUN_ACTIVE', 'This Pi driver already owns an active run.')
    const limit = plan.toolTurnLimit ?? DEFAULT_TOOL_TURN_LIMIT
    if (!Number.isInteger(limit) || limit < 1 || limit > HARD_TOOL_TURN_LIMIT) {
      throw new RangeError(`toolTurnLimit must be between 1 and ${HARD_TOOL_TURN_LIMIT}`)
    }
    const timeoutMs = plan.timeoutMs ?? DEFAULT_TIMEOUT_MS
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
      throw new RangeError('timeoutMs must be positive')

    const startedAt = this.now()
    const toolsByName = new Map(plan.tools.map((tool) => [tool.name, tool]))
    const toolViews = new Map<string, ToolCallView>()
    const toolResults = new Map<string, RuntimeToolResult>()
    let assistantMessageId: string | undefined
    let assistantStarted = false
    let assistantText = ''
    let completedToolCount = 0
    let toolTurns = 0
    let loopLimitReached = false
    let providerError: AssistantMessage | undefined
    let aborted = false
    let usage: Usage | undefined

    const tools = plan.tools.map((definition) => this.createTool(plan, definition, toolResults))
    const agent = new Agent({
      initialState: {
        systemPrompt:
          plan.systemPrompt ??
          `You are the KLineChartQuant chart analyst. Use only supplied tools. Scope: ${JSON.stringify(plan.scope)}.`,
        model: plan.model,
        thinkingLevel: 'low',
        tools,
        messages: [...(plan.transcript ?? [])],
      },
      streamFn: plan.streamFn,
      sessionId: plan.sessionId,
      toolExecution: 'parallel',
      // 仅含工具调用的助手轮次计入上限，避免模型陷入无终止的工具循环。
      shouldStopAfterTurn: ({ message }) => {
        if (!isAssistant(message) || !message.content.some((block) => block.type === 'toolCall'))
          return false
        toolTurns += 1
        if (toolTurns >= limit) {
          loopLimitReached = true
          return true
        }
        return false
      },
    })
    this.activeAgent = agent

    let timedOut = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    // 运行超时按最近一次 Pi 活动计算，流式输出和工具进度都表明任务仍在推进。
    const refreshDeadline = () => {
      if (timeout !== undefined) clearTimeout(timeout)
      timeout = setTimeout(() => {
        timedOut = true
        agent.abort()
      }, timeoutMs)
    }

    const thinkingMessageIds = new Map<number, string>()
    // 订阅 Pi 原始事件并按 UI 协议投影；文本和工具数据在离开驱动器前脱敏。
    const unsubscribe = agent.subscribe(async (event) => {
      refreshDeadline()
      if (event.type === 'message_start' && isAssistant(event.message)) {
        assistantMessageId = this.id()
        assistantStarted = false
        return
      }
      if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
        if (!assistantMessageId) return
        if (!assistantStarted) {
          assistantStarted = true
          await emit({
            type: 'assistant.message.started',
            messageId: assistantMessageId,
            createdAt: this.now(),
          })
        }
        const delta = redactString(event.assistantMessageEvent.delta, this.redaction)
        assistantText += delta
        await emit({ type: 'assistant.text.delta', messageId: assistantMessageId, delta })
        return
      }
      if (event.type === 'message_update' && event.assistantMessageEvent.type === 'thinking_start') {
        const messageId = this.id()
        thinkingMessageIds.set(event.assistantMessageEvent.contentIndex, messageId)
        await emit({
          type: 'assistant.thinking.started',
          messageId,
          createdAt: this.now(),
        })
        return
      }
      if (event.type === 'message_update' && event.assistantMessageEvent.type === 'thinking_delta') {
        const contentIndex = event.assistantMessageEvent.contentIndex
        let messageId = thinkingMessageIds.get(contentIndex)
        if (!messageId) {
          messageId = this.id()
          thinkingMessageIds.set(contentIndex, messageId)
          await emit({
            type: 'assistant.thinking.started',
            messageId,
            createdAt: this.now(),
          })
        }
        await emit({
          type: 'assistant.thinking.delta',
          messageId,
          delta: redactString(event.assistantMessageEvent.delta, this.redaction),
        })
        return
      }
      if (event.type === 'message_update' && event.assistantMessageEvent.type === 'thinking_end') {
        const messageId = thinkingMessageIds.get(event.assistantMessageEvent.contentIndex)
        if (messageId) await emit({ type: 'assistant.thinking.completed', messageId })
        return
      }
      if (event.type === 'message_end' && isAssistant(event.message)) {
        usage = addUsage(usage, event.message.usage)
        if (event.message.stopReason === 'error') providerError = event.message
        if (event.message.stopReason === 'aborted') aborted = true
        if (assistantMessageId && assistantStarted) {
          await emit({
            type:
              event.message.stopReason === 'error'
                ? 'assistant.message.failed'
                : 'assistant.message.completed',
            messageId: assistantMessageId,
          })
        }
        return
      }
      await this.projectToolEvent(plan, event, toolsByName, toolViews, toolResults, emit, () => {
        completedToolCount += 1
      })
    })

    // 统一通过 Pi 的 abort 路径中断，确保 Provider 与工具都能收到取消信号。
    refreshDeadline()

    try {
      await agent.prompt(plan.prompt)
      if (timedOut) {
        throw new AgentRuntimeError('DEADLINE_EXCEEDED', 'The Agent run exceeded its deadline.', {
          retryable: true,
          recommendedAction: 'Retry with a narrower request.',
        })
      }
      if (loopLimitReached) {
        throw new AgentRuntimeError(
          'TOOL_LOOP_LIMIT',
          `The Agent stopped after ${limit} tool turns.`,
          {
            retryable: true,
            recommendedAction: 'Refine the request and retry.',
          },
        )
      }
      if (providerError) {
        const classified = plan.classifyProviderError?.(providerError)
        if (classified) throw classified
        throw new AgentRuntimeError('PROVIDER_ERROR', 'The Provider request failed.', {
          retryable: true,
          recommendedAction: 'Retry the run or select another model.',
        })
      }
      if (aborted || agent.signal?.aborted) {
        throw new AgentRuntimeError('ABORTED', 'The Agent run was cancelled.', { retryable: true })
      }
      return {
        text: assistantText,
        usage: usage ? usageView(usage, startedAt, this.now()) : undefined,
        completedToolCount,
      }
    } catch (error) {
      if (timedOut) {
        throw new AgentRuntimeError('DEADLINE_EXCEEDED', 'The Agent run exceeded its deadline.', {
          retryable: true,
          recommendedAction: 'Retry with a narrower request.',
          cause: error,
        })
      }
      if (agent.signal?.aborted || aborted) {
        throw new AgentRuntimeError('ABORTED', 'The Agent run was cancelled.', {
          retryable: true,
          cause: error,
        })
      }
      throw toAgentRuntimeError(error)
    } finally {
      // 无论结束原因如何，都释放计时器、订阅和活动运行所有权。
      if (timeout !== undefined) clearTimeout(timeout)
      unsubscribe()
      this.activeAgent = undefined
    }
  }

  /**
   * 将宿主工具定义适配为 Pi 所需的 AgentTool。
   * @param plan 当前运行计划。
   * @param definition 宿主提供的工具定义。
   * @param results 收集成功工具结果，供结束事件投影使用。
   * @returns Pi 可执行的工具对象。
   */
  private createTool(
    plan: PiRunPlan,
    definition: RuntimeToolDefinition,
    results: Map<string, RuntimeToolResult>,
  ): AgentTool {
    return {
      name: definition.name,
      label: definition.label,
      description: definition.description,
      parameters: definition.parameters,
      executionMode: definition.executionMode,
      execute: async (rawId, input, signal, onUpdate) => {
        if (!signal)
          throw new AgentRuntimeError('INTERNAL_ERROR', 'Pi did not provide a tool AbortSignal.')
        // 即使 Provider 错误暴露了写工具，只读 Run 仍不能执行它。
        if (plan.readOnly && definition.safety !== 'read-only') {
          throw new AgentRuntimeError(
            'TOOL_NOT_ALLOWED',
            `Tool '${definition.name}' is not allowed in a read-only run.`,
          )
        }
        // 对外 ID 始终包含运行维度，避免 Pi 内部 ID 跨运行重复。
        const toolCallId = publicToolCallId(plan.runId, rawId)
        const result = await definition.execute(input, {
          runId: plan.runId,
          toolCallId,
          signal,
          progress: (progress) => {
            onUpdate?.({ content: [{ type: 'text', text: progress.label }], details: { progress } })
          },
        })
        results.set(toolCallId, result)
        return {
          content: [{ type: 'text', text: redactString(result.content, this.redaction) }],
          details: redactValue(
            { summary: result.summary, evidence: result.evidence, undoToken: result.undoToken },
            this.redaction,
          ),
        }
      },
    }
  }

  /**
   * 将 Pi 工具生命周期事件转换为 Agent UI 工具事件。
   * @param plan 当前运行计划。
   * @param event Pi 原始事件。
   * @param toolsByName 工具名称到定义的索引。
   * @param toolViews 已发出工具视图的缓存。
   * @param toolResults 成功工具结果的缓存。
   * @param emit UI 事件发送函数。
   * @param completed 成功工具完成时递增计数的回调。
   */
  private async projectToolEvent(
    plan: PiRunPlan,
    event: AgentEvent,
    toolsByName: Map<string, RuntimeToolDefinition>,
    toolViews: Map<string, ToolCallView>,
    toolResults: Map<string, RuntimeToolResult>,
    emit: PiRunEventSink,
    completed: () => void,
  ): Promise<void> {
    if (event.type === 'tool_execution_start') {
      const definition = toolsByName.get(event.toolName)
      if (!definition) return
      const id = publicToolCallId(plan.runId, event.toolCallId)
      // 输入摘要在发往 UI 前脱敏，工具原始参数不会进入事件流。
      const call: ToolCallView = {
        id,
        runId: plan.runId,
        name: definition.name,
        label: definition.label,
        status: 'running',
        inputSummary: redactString(
          definition.summarizeInput?.(event.args) ?? 'Validated tool input',
          this.redaction,
        ),
        safety: definition.safety,
        reversible: definition.reversible,
        startedAt: this.now(),
      }
      toolViews.set(id, call)
      await emit({ type: 'tool.started', call })
      return
    }
    if (event.type === 'tool_execution_update') {
      const id = publicToolCallId(plan.runId, event.toolCallId)
      const progress = safeProgress(event.partialResult?.details)
      if (progress) await emit({ type: 'tool.progress', toolCallId: id, progress })
      return
    }
    if (event.type === 'tool_execution_end') {
      const id = publicToolCallId(plan.runId, event.toolCallId)
      const started = toolViews.get(id)
      if (!started) return
      const result = toolResults.get(id)
      const finishedAt = this.now()
      // Pi 结束事件只携带执行状态，成功结果从执行阶段缓存中补齐。
      const view: ToolCallView = event.isError
        ? {
            ...started,
            status: 'failed',
            finishedAt,
            durationMs: Math.max(0, finishedAt - (started.startedAt ?? finishedAt)),
            error: {
              code: 'TOOL_ERROR',
              message: 'The chart tool could not complete the request.',
              retryable: true,
            },
          }
        : {
            ...started,
            status: 'succeeded',
            resultSummary: redactString(result?.summary ?? 'Tool completed.', this.redaction),
            resultContent: redactString(result?.content ?? '', this.redaction),
            evidence: result?.evidence,
            undoToken: result?.undoToken,
            finishedAt,
            durationMs: Math.max(0, finishedAt - (started.startedAt ?? finishedAt)),
          }
      toolViews.set(id, view)
      if (!event.isError) completed()
      await emit({ type: 'tool.finished', result: view })
    }
  }
}
