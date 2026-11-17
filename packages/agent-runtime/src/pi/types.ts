// Agent 运行计划与工具适配契约：驱动只消费官方 Harness 需要的模型、工具与提示词。
import type {
  Api,
  AssistantMessage,
  Model,
  Models,
  ModelsSimpleStreamOptions,
} from '@earendil-works/pi-ai'
import type { TSchema } from 'typebox'
import type { AgentRuntimeError } from '../contracts/errors.js'
import type {
  AgentErrorView,
  AgentUsageView,
  EvidenceView,
  ProviderReasoningEffort,
  SourceCitation,
  ToolProgressView,
} from '../contracts/ui.js'

/**
 * 工具是否会改变宿主状态。
 *
 * read 表示只读取；write 表示产生副作用（改图表、写文件、执行代码）。
 * 运行模式据此决定本轮暴露哪些工具，工具本身不再携带安全等级。
 */
export type ToolEffect = 'read' | 'write'

/** 图表工具执行完成后返回给 Pi 与 UI 的标准结果。 */
export interface RuntimeToolResult {
  /** 传回模型上下文的工具结果正文。 */
  content: string
  /** 供 UI 展示的结果摘要。 */
  summary: string
  /** 支撑结果的图表证据。 */
  evidence?: EvidenceView
  /** 可由最终 assistant 正文引用的外部来源。 */
  citations?: readonly SourceCitation[]
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
  /** 工具是否产生副作用；运行模式据此过滤。 */
  effect: ToolEffect
  /** 同一轮中工具调用的执行策略；只读工具并行，写工具串行。 */
  executionMode?: 'parallel' | 'sequential'
  /** 将已验证输入压缩为可展示摘要的函数。 */
  summarizeInput?: (input: unknown) => string
  /**
   * 执行工具。
   * @param input 已通过 Schema 校验的工具输入。
   * @param context 当前会话、运行、调用、取消和进度上下文。
   * @returns 标准化的工具执行结果。
   */
  execute(
    input: unknown,
    context: {
      sessionId: string
      runId: string
      toolCallId: string
      signal: AbortSignal
      progress(update: ToolProgressView): void
    },
  ): Promise<RuntimeToolResult>
}

/** 一次 Agent 运行交给驱动的最小计划：模型、工具、提示词与流参数。 */
export interface AgentRunPlan {
  /** 官方 Harness 使用的 Provider 集合。 */
  readonly models: Models
  /** 本次请求使用的模型。 */
  readonly model: Model<Api>
  /** 本次运行允许调用的工具列表。 */
  readonly tools: readonly RuntimeToolDefinition[]
  /** 覆盖默认行为的系统提示词。 */
  readonly systemPrompt?: string
  /** 当前请求使用的模型思考强度。 */
  readonly reasoningEffort?: ProviderReasoningEffort
  /** 覆盖 Provider 流式调用参数。 */
  readonly streamOptions?: ModelsSimpleStreamOptions
  /** 将 Pi 流式错误归类为运行时错误的可选函数。 */
  readonly classifyProviderError?: (message: AssistantMessage) => AgentRuntimeError | undefined
}
