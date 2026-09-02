// Pi Agent 运行计划、工具适配和 UI 事件投影的数据契约。
import type { AgentRuntimeError } from '../contracts/errors.js'
import type {
  AgentRunUiEventInput,
  AgentErrorView,
  AgentUsageView,
  AgentRunScope,
  EvidenceView,
  ToolProgressView,
  ToolSafety,
} from '../contracts/ui.js'
import type { AgentMessage, StreamFn } from '@earendil-works/pi-agent-core'
import type { Model, Api, AssistantMessage } from '@earendil-works/pi-ai'
import type { TSchema } from 'typebox'

/** 图表工具执行完成后返回给 Pi 与 UI 的标准结果。 */
export interface RuntimeToolResult {
  /** 传回模型上下文的工具结果正文。 */
  content: string
  /** 供 UI 展示的结果摘要。 */
  summary: string
  /** 支撑结果的图表证据。 */
  evidence?: EvidenceView
  /** 可逆工具操作对应的撤销令牌。 */
  undoToken?: string
  /** 工具执行产生的资源用量。 */
  usage?: AgentUsageView
  /** 业务工具失败时传给模型和 UI 的可修正错误。 */
  failure?: AgentErrorView
}

/**
 * 将宿主图表能力暴露给 Pi Agent 的工具定义。
 * @typeParam TParameters TypeBox 描述的工具参数 Schema 类型。
 */
export interface RuntimeToolDefinition<TParameters extends TSchema = TSchema> {
  /** Provider 调用工具时使用的稳定名称。 */
  name: string
  /** UI 展示的工具名称。 */
  label: string
  /** 供模型理解用途和约束的工具说明。 */
  description: string
  /** 用于 Pi 参数验证的 TypeBox Schema。 */
  parameters: TParameters
  /** 工具对图表状态的安全等级。 */
  safety: ToolSafety
  /** 工具结果是否支持撤销。 */
  reversible: boolean
  /** 同一轮中工具调用的执行策略。 */
  executionMode?: 'parallel' | 'sequential'
  /** 将已验证输入压缩为可展示摘要的函数。 */
  summarizeInput?: (input: unknown) => string
  /**
   * 执行工具。
   * @param input 已通过 Schema 校验的工具输入。
   * @param context 当前运行、调用、取消和进度上下文。
   * @returns 标准化的工具执行结果。
   */
  execute(
    input: unknown,
    context: {
      runId: string
      toolCallId: string
      signal: AbortSignal
      progress(update: ToolProgressView): void
    },
  ): Promise<RuntimeToolResult>
}

/** Pi 单次 Agent 运行所需的完整不可变计划。 */
export interface PiRunPlan {
  /** 所属 Agent 会话 ID。 */
  sessionId: string
  /** 本次运行 ID。 */
  runId: string
  /** 本次用户轮次 ID。 */
  turnId: string
  /** 用户输入提示词。 */
  prompt: string
  /** 是否仅允许只读工具。 */
  readOnly: boolean
  /** 当前图表上下文快照。 */
  scope: Readonly<AgentRunScope>
  /** 作为上下文传递给模型的历史消息。 */
  transcript?: readonly AgentMessage[]
  /** 本次运行允许调用的工具列表。 */
  tools: readonly RuntimeToolDefinition[]
  /** Pi 使用的模型描述。 */
  model: Model<Api>
  /** 宿主提供的模型流式调用函数。 */
  streamFn: StreamFn
  /** 将 Pi 流式错误归类为运行时错误的可选函数。 */
  classifyProviderError?: (message: AssistantMessage) => AgentRuntimeError | undefined
  /** 覆盖默认行为的系统提示词。 */
  systemPrompt?: string
  /** 单次运行允许的最大工具调用轮数。 */
  toolTurnLimit?: number
  /** 单次运行的总超时时间。 */
  timeoutMs?: number
}

/** Pi 驱动器完成一次运行后返回的结果。 */
export interface PiRunResult {
  /** 聚合后的助手文本。 */
  text: string
  /** 聚合后的模型用量。 */
  usage?: AgentUsageView
  /** 成功完成的工具调用数量。 */
  completedToolCount: number
}

/** 接收投影后 Agent UI 事件的同步或异步函数。 */
export type PiRunEventSink = (event: AgentRunUiEventInput) => Promise<void> | void
