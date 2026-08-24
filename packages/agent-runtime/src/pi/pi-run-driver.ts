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
const DEFAULT_TIMEOUT_MS = 120_000

function isAssistant(message: unknown): message is AssistantMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'role' in message &&
    message.role === 'assistant'
  )
}

function usageView(usage: Usage, startedAt: number, now: number): AgentUsageView {
  return {
    inputTokens: usage.input + usage.cacheRead,
    outputTokens: usage.output,
    costUsd: usage.cost.total,
    durationMs: Math.max(0, now - startedAt),
  }
}

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

function publicToolCallId(runId: string, rawId: string): string {
  return `${encodeURIComponent(runId)}:${encodeURIComponent(rawId)}`
}

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

export interface PiRunDriverOptions {
  now?: () => number
  id?: () => string
  redaction?: RedactionOptions
}

export class PiRunDriver {
  private readonly now: () => number
  private readonly id: () => string
  private readonly redaction: RedactionOptions
  private activeAgent: Agent | undefined

  constructor(options: PiRunDriverOptions = {}) {
    this.now = options.now ?? Date.now
    this.id = options.id ?? (() => globalThis.crypto.randomUUID())
    this.redaction = options.redaction ?? {}
  }

  abort(): void {
    this.activeAgent?.abort()
  }

  async waitForIdle(): Promise<void> {
    await this.activeAgent?.waitForIdle()
  }

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
        thinkingLevel: 'off',
        tools,
        messages: [...(plan.transcript ?? [])],
      },
      streamFn: plan.streamFn,
      sessionId: plan.sessionId,
      toolExecution: 'parallel',
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

    const unsubscribe = agent.subscribe(async (event) => {
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

    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      agent.abort()
    }, timeoutMs)

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
      clearTimeout(timeout)
      unsubscribe()
      this.activeAgent = undefined
    }
  }

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
