// 本文件通过官方 Harness 提交与执行输入，只将官方事件投影到 UI 契约。

import { isJsonValue } from '@earendil-works/chord'
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import type { createModels, Usage } from '@earendil-works/pi-ai'
import {
  type Conversation,
  defineExtension,
  type Harness,
  type Registry,
  type ToolRegistration,
  watchEvents,
} from '@earendil-works/pi-durable'
import { AgentRuntimeError } from '../../contracts/errors.js'
import type { ToolCallView } from '../../contracts/ui.js'
import type { PiRunEventSink, PiRunPlan, PiRunResult, RuntimeToolResult } from '../types.js'

export interface DurableExecution {
  harness: Harness
  models: ReturnType<typeof createModels>
  registry: Registry
}

/** 单次输入的 UI 适配器；生成、工具调度、重试和取消由 Harness 负责。 */
export class DurableRunDriver {
  private conversation: Conversation | undefined
  constructor(
    private readonly execution: DurableExecution,
    private readonly resolveConversation: (plan: PiRunPlan) => Promise<Conversation>,
  ) {}
  /** 官方取消会等待所属任务结算。 */
  abort(): void {
    void this.conversation?.abort(BACKGROUND_CONTEXT)
  }
  /** 等待官方运行队列清空。 */
  async waitForIdle(): Promise<void> {
    await this.conversation?.waitForIdle(BACKGROUND_CONTEXT)
  }
  /** 配置当前分支并通过官方 submit/watchEvents 执行一次输入。 */
  async run(plan: PiRunPlan, emit: PiRunEventSink): Promise<PiRunResult> {
    if (!plan.models)
      throw new AgentRuntimeError(
        'PROVIDER_NOT_CONFIGURED',
        'The Provider does not supply Pi Models.',
      )
    const conversation = await this.resolveConversation(plan)
    this.conversation = conversation
    for (const provider of plan.models.getProviders()) this.execution.models.setProvider(provider)
    const providerModels = plan.models
    this.execution.models.streamSimple = (model, context, options) =>
      providerModels.streamSimple(model, context, { ...options, ...plan.streamOptions })
    const results = new Map<string, RuntimeToolResult>()
    const tools: ToolRegistration[] = plan.tools.map((definition) => ({
      name: definition.name,
      description: definition.description,
      parameters: definition.parameters,
      executionMode: definition.executionMode,
      replay: 'unsafe',
      execute: async (input, api, context) => {
        const signal = context.abortSignal ?? new AbortController().signal
        const result = await definition.execute(input, {
          runId: plan.runId,
          toolCallId: api.callId,
          signal,
          progress: (progress) => api.output(progress.label),
        })
        const details: unknown = JSON.parse(JSON.stringify(result))
        results.set(api.callId, result)
        for (const citation of result.citations ?? []) citations.set(citation.id, citation)
        if (!isJsonValue(details)) throw new Error('Tool details must be JSON.')
        return {
          content: [{ type: 'text', text: result.content }],
          details,
          isError: result.failure !== undefined,
        }
      },
    }))
    const extension = defineExtension({ name: `kq.tools.${conversation.id}`, tools })
    this.execution.registry.install(extension)
    await conversation.configure(
      {
        model: { provider: plan.model.provider, modelId: plan.model.id },
        thinkingLevel: plan.reasoningEffort === 'none' ? 'off' : (plan.reasoningEffort ?? 'low'),
        extensions: [extension],
        tools,
        instructions:
          plan.systemPrompt ??
          'You are the KLineChartQuant chart analyst. Use only supplied tools.',
      },
      BACKGROUND_CONTEXT,
    )
    const events = await watchEvents(this.execution.harness, conversation.id, BACKGROUND_CONTEXT)
    let text = ''
    let messageId = ''
    let usage: Usage | undefined
    const citations = new Map<string, import('../../contracts/ui.js').SourceCitation>()
    const startedAt = Date.now()
    let cancelled = false
    let completedToolCount = 0
    const calls = new Map<string, ToolCallView>()
    const thinking = new Map<number, string>()
    let delivered = Promise.resolve()
    events.start(async (batch) => {
      delivered = (async () => {
        for (const event of batch) {
          if (event.type === 'message_start' && event.message.role === 'assistant') {
            thinking.clear()
            messageId = globalThis.crypto.randomUUID()
            await emit({ type: 'assistant.message.started', messageId, createdAt: Date.now() })
          }
          if (event.type === 'message_update')
            for (const change of event.changes) {
              if (change.type === 'text_delta') {
                text += change.delta
                await emit({ type: 'assistant.text.delta', messageId, delta: change.delta })
              }
              if (change.type === 'thinking_start') {
                const id = globalThis.crypto.randomUUID()
                thinking.set(change.contentIndex, id)
                await emit({
                  type: 'assistant.thinking.started',
                  messageId: id,
                  createdAt: Date.now(),
                })
              }
              if (change.type === 'thinking_delta') {
                const id = thinking.get(change.contentIndex)
                if (id)
                  await emit({
                    type: 'assistant.thinking.delta',
                    messageId: id,
                    delta: change.delta,
                  })
              }
            }
          if (event.type === 'message_end') {
            const message = event.entry.model?.find((item) => item.role === 'assistant')
            if (message?.role === 'assistant') {
              cancelled ||= message.stopReason === 'aborted'
              for (const id of thinking.values())
                await emit({ type: 'assistant.thinking.completed', messageId: id })
              const previous = usage
              usage = previous
                ? {
                    input: previous.input + message.usage.input,
                    output: previous.output + message.usage.output,
                    cacheRead: previous.cacheRead + message.usage.cacheRead,
                    cacheWrite: previous.cacheWrite + message.usage.cacheWrite,
                    totalTokens: previous.totalTokens + message.usage.totalTokens,
                    cost: {
                      input: previous.cost.input + message.usage.cost.input,
                      output: previous.cost.output + message.usage.cost.output,
                      cacheRead: previous.cost.cacheRead + message.usage.cost.cacheRead,
                      cacheWrite: previous.cost.cacheWrite + message.usage.cost.cacheWrite,
                      total: previous.cost.total + message.usage.cost.total,
                    },
                  }
                : message.usage
              await emit({
                type: 'assistant.message.completed',
                messageId,
                citations: [...citations.values()],
              })
            }
          }
          if (event.type === 'tool_execution_start') {
            const definition = plan.tools.find((tool) => tool.name === event.toolName)
            if (!definition) continue
            const call: ToolCallView = {
              id: event.toolCallId,
              runId: plan.runId,
              name: definition.name,
              label: definition.label,
              inputSummary: definition.summarizeInput?.(event.args) ?? '',
              status: 'running',
              safety: definition.safety,
              reversible: definition.reversible,
              startedAt: Date.now(),
            }
            calls.set(call.id, call)
            await emit({ type: 'tool.started', call })
          }
          if (event.type === 'tool_execution_end') {
            const call = calls.get(event.toolCallId)
            if (!call) continue
            const result = event.entry?.model?.find((item) => item.role === 'toolResult')
            const failed = result?.role === 'toolResult' && result.isError
            const details = results.get(event.toolCallId)
            if (!failed) completedToolCount++
            await emit({
              type: 'tool.finished',
              result: {
                ...call,
                status: failed ? 'failed' : 'succeeded',
                resultSummary: details?.summary,
                error: details?.failure,
                undoToken: details?.undoToken,
                evidence: details?.evidence,
                resultContent: result?.content
                  .flatMap((block) => (block.type === 'text' ? [block.text] : []))
                  .join('\n'),
                finishedAt: Date.now(),
              },
            })
          }
          if (event.type === 'tool_execution_update' && event.output) {
            const label = 'set' in event.output ? event.output.set : event.output.append
            if (label)
              await emit({
                type: 'tool.progress',
                toolCallId: event.toolCallId,
                progress: { label },
              })
          }
        }
      })()
      await delivered
    })
    try {
      const input = await conversation.submit(
        { type: 'input', content: plan.prompt, requestId: plan.runId, whenBusy: 'reject' },
        BACKGROUND_CONTEXT,
      )
      const settled = await input.wait(BACKGROUND_CONTEXT)
      await conversation.waitForIdle(BACKGROUND_CONTEXT)
      await events.stop()
      await delivered
      if (settled.status !== 'done')
        throw new AgentRuntimeError(
          cancelled || settled.reason === 'aborted' ? 'ABORTED' : 'PROVIDER_ERROR',
          settled.reason,
        )
      const answerId = settled.answer
      if (answerId === undefined) throw new AgentRuntimeError('INTERNAL_ERROR', 'Pi did not return an answer entry.')
      const answer = await conversation.commit((tx) => tx.entry(answerId), BACKGROUND_CONTEXT)
      const finalMessage = answer?.model?.find((message) => message.role === 'assistant')
      if (finalMessage?.role === 'assistant')
        text = finalMessage.content
          .flatMap((block) => (block.type === 'text' ? [block.text] : []))
          .join('')
      return {
        text,
        usage: usage
          ? {
              inputTokens: usage.input + usage.cacheRead,
              outputTokens: usage.output,
              costUsd: usage.cost.total,
              contextTokens:
                finalMessage?.role === 'assistant'
                  ? finalMessage.usage.input + finalMessage.usage.cacheRead
                  : undefined,
              contextWindow: plan.model.contextWindow,
              durationMs: Date.now() - startedAt,
            }
          : undefined,
        completedToolCount,
        citations: [...citations.values()],
      }
    } finally {
      await events.stop()
      this.conversation = undefined
    }
  }
}
