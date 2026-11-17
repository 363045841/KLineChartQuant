// 浏览器端工具解析：图表工具来自 Core 的纯数据目录，运行时工具在此补上宿主能力。

import {
  type AgentErrorView,
  ASK_USER_TOOL_METADATA,
  createAskUserTool,
  createExaWebSearchProvider,
  createWebSearchTool,
  type RuntimeToolDefinition,
  WEB_SEARCH_TOOL_METADATA,
} from '@363045841yyt/klinechart-agent-runtime'
import { getRecoveryHint, isKLineChartError } from '@363045841yyt/klinechart-core'
import { ToolInputValidationError } from '@363045841yyt/klinechart-core/agent-tools'
import {
  CHART_TOOL_METADATA,
  type ChartToolMetadata,
  createChartToolCatalog,
} from '@363045841yyt/klinechart-core/controllers'
import type { BrowserToolContext, BrowserToolRegistryDependencies } from '../types.js'

/** 设置界面需要的工具条目：宿主提供的静态契约。 */
export type BrowserToolEntry = ChartToolMetadata

/** 把图表与运行时工具解析成某一轮真正可用的工具集合。 */
export class BrowserToolRegistry {
  constructor(private readonly dependencies: BrowserToolRegistryDependencies) {}

  /**
   * 返回本轮可用工具。
   *
   * 模式在这里唯一一次生效：build 暴露全部工具，plan 只留只读工具。
   */
  resolveTools(context: BrowserToolContext): readonly RuntimeToolDefinition[] {
    const tools = [...this.chartTools(context), this.createWebSearchTool(), this.createAskUser()]
    return tools.filter((tool) => context.mode === 'build' || tool.effect === 'read')
  }

  /** 返回宿主提供的全部工具，与当前模式无关。 */
  listTools(): readonly BrowserToolEntry[] {
    return [
      ...CHART_TOOL_METADATA,
      { ...WEB_SEARCH_TOOL_METADATA, effect: 'read' as const },
      { ...ASK_USER_TOOL_METADATA, effect: 'read' as const },
    ]
  }

  /** 图表目录按当前绑定的图表实例组装；未绑定时不提供任何图表工具。 */
  private chartTools(context: BrowserToolContext): readonly RuntimeToolDefinition[] {
    if (!context.agent) return []
    return createChartToolCatalog(context.agent.tools).map((tool) => this.toRuntimeTool(tool))
  }

  /** 把 Core 的工具定义适配为 Pi 需要的运行时定义。 */
  private toRuntimeTool(
    tool: ReturnType<typeof createChartToolCatalog>[number],
  ): RuntimeToolDefinition {
    return {
      name: tool.name,
      label: tool.label,
      description: tool.description,
      parameters: tool.parameters,
      effect: tool.effect,
      executionMode: tool.effect === 'read' ? 'parallel' : 'sequential',
      ...(tool.summarizeInput === undefined ? {} : { summarizeInput: tool.summarizeInput }),
      execute: async (input, context) => {
        context.signal.throwIfAborted()
        context.progress({ label: `Running ${tool.label}` })
        try {
          const result = await tool.execute(input, {
            signal: context.signal,
            progress: context.progress,
          })
          context.signal.throwIfAborted()
          return result
        } catch (error) {
          const failure = toolFailure(error)
          if (!failure) throw error
          return failure
        }
      },
    }
  }

  /** 网络搜索：未配置 Key 时仍暴露，由工具结果引导用户配置。 */
  private createWebSearchTool(): RuntimeToolDefinition {
    const apiKey = this.dependencies.getWebSearchApiKey()
    return createWebSearchTool(
      apiKey ? createExaWebSearchProvider({ apiKey, fetch: this.dependencies.fetch }) : undefined,
    )
  }

  /** 宿主提问通道。 */
  private createAskUser(): RuntimeToolDefinition {
    return createAskUserTool({ request: this.dependencies.requestQuestion })
  }
}

/** 领域错误转成模型可修正的失败结果；无法归类时向上抛。 */
function toolFailure(
  error: unknown,
): { content: string; summary: string; failure: AgentErrorView } | null {
  if (error instanceof ToolInputValidationError) {
    const failure = {
      code: error.code,
      message: error.message,
      retryable: true,
      recommendedAction: 'Correct the invalid field and retry the request.',
    }
    return {
      content: JSON.stringify({ success: false, error: failure, stateChanged: false }),
      summary: failure.message,
      failure,
    }
  }
  if (!isKLineChartError(error)) return null
  const failure = {
    code: error.code,
    message: error.message,
    retryable: true,
    recommendedAction: getRecoveryHint(error.code),
  }
  return {
    content: JSON.stringify({ success: false, error: failure, stateChanged: false }),
    summary: failure.message,
    failure,
  }
}
