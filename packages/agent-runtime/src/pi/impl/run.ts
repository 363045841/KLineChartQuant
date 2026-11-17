// 运行驱动：把一次运行的工具、模型与提示词写进官方 Conversation，并提交用户输入。
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import type { createModels } from '@earendil-works/pi-ai'
import {
  type Conversation,
  ConversationBusy,
  defineExtension,
  type Harness,
  type Registry,
  type Submission,
} from '@earendil-works/pi-durable'
import { AgentRuntimeError } from '../../contracts/errors.js'
import type { AgentRunPlan, RuntimeToolDefinition } from '../types.js'

/** 官方运行时句柄：Harness、模型集合与工具 Registry 由宿主打开一次。 */
export interface DurableExecution {
  harness: Harness
  models: ReturnType<typeof createModels>
  registry: Registry
}

/** 一次运行的宿主输入。 */
export interface AgentRunInput {
  /** 运行标识，同时作为官方 submission 的 requestId。 */
  readonly runId: string
  /** 会话标识，供工具回调宿主交互使用。 */
  readonly sessionId: string
  /** 用户输入正文。 */
  readonly prompt: string
}

/**
 * 安装扩展、写入模型与提示词，然后提交用户输入。
 * 提交失败（会话忙、模型缺失）直接抛出；运行结果由官方 `pi.live` 与条目记录表达。
 * @param execution 官方运行时句柄。
 * @param conversation 目标会话。
 * @param plan 本次运行计划。
 * @param input 运行标识、会话标识与用户输入。
 * @returns 官方提交句柄，调用方可用它等待运行结算。
 */
export async function submitAgentRun(
  execution: DurableExecution,
  conversation: Conversation,
  plan: AgentRunPlan,
  input: AgentRunInput,
): Promise<Submission> {
  const provider = plan.models.getProvider(plan.model.provider)
  if (!provider) {
    throw new AgentRuntimeError('PROVIDER_NOT_CONFIGURED', 'The model Provider is missing.')
  }
  // 每个会话使用独立 Provider 标识，模型目录由当前计划提供。
  const providerId = `${provider.id}:conversation:${conversation.id}`
  const model = { ...plan.model, provider: providerId }
  execution.models.setProvider({
    ...provider,
    id: providerId,
    getModels: () => [model],
    getAllModels: () => [model],
    streamSimple: (_streamModel, streamContext, options) =>
      provider.streamSimple(plan.model, streamContext, { ...options, ...plan.streamOptions }),
  })
  const extension = defineExtension({
    name: `kq.tools.${conversation.id}`,
    tools: plan.tools.map((definition: RuntimeToolDefinition) => ({
      name: definition.name,
      description: definition.description,
      parameters: definition.parameters,
      executionMode: definition.executionMode,
      // 中断后的工具不自动重放，避免改动图表状态被重复执行。
      replay: 'unsafe' as const,
      execute: async (args, api, context) => {
        const presentation = {
          label: definition.label,
          inputSummary: definition.summarizeInput?.(args) ?? '',
        }
        await api.details(presentation, context)
        const result = await definition.execute(args, {
          sessionId: input.sessionId,
          runId: input.runId,
          toolCallId: api.callId,
          signal: context.abortSignal ?? new AbortController().signal,
          progress: (progress) => api.output(progress.label),
        })
        return {
          output: [{ type: 'text' as const, text: result.content }],
          details: {
            ...presentation,
            summary: result.summary,
            ...(result.evidence === undefined ? {} : { evidence: result.evidence }),
            ...(result.citations === undefined ? {} : { citations: [...result.citations] }),
            ...(result.undoToken === undefined ? {} : { undoToken: result.undoToken }),
            ...(result.usage === undefined ? {} : { usage: result.usage }),
            ...(result.failure === undefined ? {} : { failure: result.failure }),
          },
          isError: result.failure !== undefined,
        }
      },
    })),
  })
  execution.registry.install(extension)
  await conversation.configure(
    {
      model: { provider: providerId, modelId: plan.model.id },
      thinkingLevel: plan.reasoningEffort === 'none' ? 'off' : (plan.reasoningEffort ?? 'low'),
      extensions: [extension],
      tools: extension.tools,
      instructions:
        plan.systemPrompt ?? 'You are the KLineChartQuant chart analyst. Use only supplied tools.',
    },
    BACKGROUND_CONTEXT,
  )
  try {
    return await conversation.submit(
      {
        type: 'input',
        content: input.prompt,
        requestId: input.runId,
        whenBusy: 'reject',
      },
      BACKGROUND_CONTEXT,
    )
  } catch (error) {
    if (error instanceof ConversationBusy) {
      throw new AgentRuntimeError('RUN_ACTIVE', 'The Agent session is still running.', {
        retryable: true,
        cause: error,
      })
    }
    throw error
  }
}
