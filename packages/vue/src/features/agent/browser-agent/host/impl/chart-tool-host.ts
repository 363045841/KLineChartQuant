/**
 * 页面侧图表工具端口：把当前绑定的图表能力声明给宿主，并在宿主调用时执行。
 *
 * 工具定义仍来自 Core 的目录，这里只负责「序列化描述」与「执行 + 失败投影」，
 * 不复制工具的业务逻辑。
 */

import type { RuntimeToolResult } from '@363045841yyt/klinechart-agent-runtime'
import { toolFailureResult } from '@363045841yyt/klinechart-agent-runtime'
import type {
  AgentClientToolHost,
  AgentToolMetadata,
  ChartToolDescriptor,
} from '@363045841yyt/klinechart-agent-runtime/browser'
import {
  type AgentChartToolExecution,
  AgentRuntimeError,
} from '@363045841yyt/klinechart-agent-runtime/browser'
import { ERROR_CODES, getRecoveryHint, isKLineChartError } from '@363045841yyt/klinechart-core'
import { ToolInputValidationError } from '@363045841yyt/klinechart-core/agent-tools'
import type { ChartAgentController } from '@363045841yyt/klinechart-core/controllers'
import {
  CHART_TOOL_METADATA,
  createChartToolCatalog,
} from '@363045841yyt/klinechart-core/controllers'

/** 可重试的业务错误码；与工具侧同一份定义，避免两处漂移。 */
const RETRYABLE_CODES: ReadonlySet<string> = new Set([
  ERROR_CODES.FETCH_FAILED,
  ERROR_CODES.FETCH_ABORTED,
])

/** 把业务错误投影成工具失败结果；非业务错误原样抛出。 */
function toolFailure(error: unknown): RuntimeToolResult | null {
  if (error instanceof ToolInputValidationError) {
    return toolFailureResult({
      code: error.code,
      message: error.message,
      retryable: true,
      recommendedAction: 'Correct the invalid field and retry the request.',
    })
  }
  if (!isKLineChartError(error)) return null
  return toolFailureResult({
    code: error.code,
    message: error.message,
    retryable: RETRYABLE_CODES.has(error.code),
    recommendedAction: getRecoveryHint(error.code),
    ...(error.details === undefined ? {} : { details: error.details }),
  })
}

/** 页面图表工具端口。 */
export class ChartToolHost implements AgentClientToolHost {
  private agent: ChartAgentController | null = null

  /** 绑定或解绑当前图表的 Agent controller。 */
  bind(agent: ChartAgentController | null | undefined): void {
    this.agent = agent ?? null
  }

  /** 当前绑定的 controller；图表未就绪时为 null。 */
  get bound(): ChartAgentController | null {
    return this.agent
  }

  /** 未绑定图表时只提供静态契约，工具设置界面仍能看到清单。 */
  metadata(): readonly AgentToolMetadata[] {
    return CHART_TOOL_METADATA.map((tool) => ({
      name: tool.name,
      label: tool.label,
      description: tool.description,
      effect: tool.effect,
    }))
  }

  /** 只有绑定图表后才能给出可执行定义；宿主按这份清单组装运行工具表。 */
  catalog(): readonly ChartToolDescriptor[] {
    const agent = this.agent
    if (!agent) return []
    return createChartToolCatalog(agent.tools).map((tool) => ({
      name: tool.name,
      label: tool.label,
      description: tool.description,
      effect: tool.effect,
      parameters: tool.parameters,
    }))
  }

  /** 执行一次图表工具；未知工具与未绑定图表都明确报错。 */
  async execute(execution: AgentChartToolExecution): Promise<RuntimeToolResult> {
    const agent = this.agent
    if (!agent)
      throw new AgentRuntimeError('TARGET_LOST', 'The chart for this Agent tool is not available.')
    const tool = createChartToolCatalog(agent.tools).find(
      (candidate) => candidate.name === execution.toolName,
    )
    if (!tool)
      throw new AgentRuntimeError(
        'TOOL_NOT_ALLOWED',
        `Agent tool '${execution.toolName}' is not available on this chart.`,
      )
    execution.signal.throwIfAborted()
    try {
      const result = await tool.execute(execution.input, {
        signal: execution.signal,
        progress: () => undefined,
      })
      execution.signal.throwIfAborted()
      return result
    } catch (error) {
      const failure = toolFailure(error)
      if (!failure) throw error
      return failure
    }
  }
}
