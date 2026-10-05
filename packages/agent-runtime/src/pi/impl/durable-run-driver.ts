// 本文件仅装配宿主模型与工具并提交输入；执行和状态持久化完全由官方 Harness 管理。
import { isJsonValue } from '@earendil-works/chord'
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import type { createModels } from '@earendil-works/pi-ai'
import {
  type Conversation,
  defineExtension,
  type Harness,
  type Registry,
} from '@earendil-works/pi-durable'
import { AgentRuntimeError } from '../../contracts/errors.js'
import type { PiRunPlan, PiRunResult } from '../types.js'

export interface DurableExecution {
  harness: Harness
  models: ReturnType<typeof createModels>
  registry: Registry
}

/** 宿主只拥有提交操作，不维护模型消息、用量或工具运行状态。 */
export class DurableRunDriver {
  private conversation: Conversation | undefined
  private cancelled = false

  constructor(
    private readonly execution: DurableExecution,
    private readonly resolveConversation: (plan: PiRunPlan) => Promise<Conversation>,
  ) {}

  /** 请求官方取消；配置阶段的取消会阻止提交。 */
  abort(): void {
    this.cancelled = true
    void this.conversation?.abort(BACKGROUND_CONTEXT)
  }

  /** 等待官方任务结算。 */
  async waitForIdle(): Promise<void> {
    await this.conversation?.waitForIdle(BACKGROUND_CONTEXT)
  }

  /** 注册宿主能力，提交输入并等待官方 Submission 终态。 */
  async run(plan: PiRunPlan): Promise<PiRunResult> {
    if (!plan.models)
      throw new AgentRuntimeError(
        'PROVIDER_NOT_CONFIGURED',
        'The Provider does not supply Pi Models.',
      )
    const conversation = await this.resolveConversation(plan)
    this.conversation = conversation
    const providerModels = plan.models
    const provider = providerModels.getProvider(plan.model.provider)
    if (!provider)
      throw new AgentRuntimeError('PROVIDER_NOT_CONFIGURED', 'The model Provider is missing.')
    // 每条 Conversation 的宿主请求选项独立，不覆盖共享 Models 的方法。
    const providerId = `${provider.id}:conversation:${conversation.id}`
    const model = { ...plan.model, provider: providerId }
    this.execution.models.setProvider({
      ...provider,
      id: providerId,
      getModels: () => [model],
      getAllModels: () => [model],
      streamSimple: (_model, context, options) =>
        provider.streamSimple(plan.model, context, { ...options, ...plan.streamOptions }),
    })
    const extension = defineExtension({
      name: `kq.tools.${conversation.id}`,
      tools: plan.tools.map((definition) => ({
        name: definition.name,
        description: definition.description,
        parameters: definition.parameters,
        executionMode: definition.executionMode,
        replay: 'unsafe',
        execute: async (input, api, context) => {
          const presentation = {
            label: definition.label,
            safety: definition.safety,
            reversible: definition.reversible,
            inputSummary: definition.summarizeInput?.(input) ?? '',
          }
          await api.details(presentation, context)
          const result = await definition.execute(input, {
            runId: plan.runId,
            toolCallId: api.callId,
            signal: context.abortSignal ?? new AbortController().signal,
            progress: (progress) => api.output(progress.label),
          })
          const details: unknown = JSON.parse(JSON.stringify({ ...result, presentation }))
          if (!isJsonValue(details)) throw new Error('Tool details must be JSON.')
          return {
            content: [{ type: 'text', text: result.content }],
            details,
            isError: result.failure !== undefined,
          }
        },
      })),
    })
    this.execution.registry.install(extension)
    await conversation.configure(
      {
        model: { provider: providerId, modelId: plan.model.id },
        thinkingLevel: plan.reasoningEffort === 'none' ? 'off' : (plan.reasoningEffort ?? 'low'),
        extensions: [extension],
        tools: extension.tools,
        instructions:
          plan.systemPrompt ??
          'You are the KLineChartQuant chart analyst. Use only supplied tools.',
      },
      BACKGROUND_CONTEXT,
    )
    try {
      if (this.cancelled) throw new AgentRuntimeError('ABORTED', 'The Agent run was cancelled.')
      const submission = await conversation.submit(
        { type: 'input', content: plan.prompt, requestId: plan.runId, whenBusy: 'reject' },
        BACKGROUND_CONTEXT,
      )
      const settled = await submission.wait(BACKGROUND_CONTEXT)
      if (settled.status !== 'done') {
        const history = await conversation.context(BACKGROUND_CONTEXT)
        const message = [...history.entries]
          .reverse()
          .flatMap((entry) => entry.model ?? [])
          .find((item) => item.role === 'assistant')
        if (message?.role === 'assistant') {
          const classified = plan.classifyProviderError?.(message)
          if (classified) throw classified
        }
        const detail = typeof settled.detail === 'string' ? settled.detail : settled.reason
        throw new AgentRuntimeError(
          this.cancelled || settled.reason === 'aborted' ? 'ABORTED' : 'PROVIDER_ERROR',
          detail,
          { retryable: true, raw: detail },
        )
      }
      // 返回值仅用于独立调用；界面从 Conversation.watch() 读取官方消息。
      const answerId = settled.answer
      const answer =
        answerId === undefined
          ? undefined
          : await conversation.commit((tx) => tx.entry(answerId), BACKGROUND_CONTEXT)
      const message = answer?.model?.find((item) => item.role === 'assistant')
      return {
        text:
          message?.role === 'assistant'
            ? message.content
                .flatMap((block) => (block.type === 'text' ? [block.text] : []))
                .join('')
            : '',
        completedToolCount: 0,
        citations: [],
      }
    } finally {
      this.conversation = undefined
    }
  }
}
