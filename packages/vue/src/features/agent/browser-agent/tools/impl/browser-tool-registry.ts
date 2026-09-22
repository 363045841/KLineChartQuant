// 浏览器端图表、搜索与提问工具的注册和 Core → Runtime 适配实现。

import type { AgentErrorView } from '@363045841yyt/klinechart-agent-runtime'
import {
  ASK_USER_TOOL_METADATA,
  createAskUserTool,
  createExaWebSearchProvider,
  createWebSearchTool,
  RuntimeToolCatalog,
  type RuntimeToolDefinition,
  WEB_SEARCH_TOOL_METADATA,
} from '@363045841yyt/klinechart-agent-runtime'
import { getRecoveryHint, isKLineChartError } from '@363045841yyt/klinechart-core'
import { ToolInputValidationError } from '@363045841yyt/klinechart-core/agent-tools'
import {
  type ChartAgentController,
  getRegisteredChartTools,
} from '@363045841yyt/klinechart-core/controllers'
import type { BrowserToolContext, BrowserToolRegistryDependencies } from '../types.js'

type DrawingCreateError = Error & {
  readonly code?: string
  readonly details?: Readonly<Record<string, unknown>>
}

interface DrawingCreateFailureDetail {
  readonly code: string
  readonly message: string
  readonly field: string
  readonly expected: string
  readonly recovery: string
}

type RegisteredChartTool = ReturnType<typeof getRegisteredChartTools>[number]

/** 管理浏览器宿主中 Runtime Tool Catalog 的注册与解析。 */
export class BrowserToolRegistry {
  readonly catalog = new RuntimeToolCatalog<BrowserToolContext>()

  constructor(private readonly dependencies: BrowserToolRegistryDependencies) {
    this.registerTools()
  }

  private registerTools(): void {
    for (const chartTool of getRegisteredChartTools()) {
      this.catalog.register({
        ...chartTool.config,
        create: ({ agent, readOnly }) => {
          if (!agent || (readOnly && chartTool.config.safety !== 'read-only')) return undefined
          return this.createRegisteredTool(chartTool, agent)
        },
      })
    }
    this.catalog.register({
      ...WEB_SEARCH_TOOL_METADATA,
      create: () => this.createWebSearchTool(),
    })
    this.catalog.register({
      ...ASK_USER_TOOL_METADATA,
      create: () => createAskUserTool({ request: this.dependencies.requestQuestion }),
    })
  }

  private createWebSearchTool(): RuntimeToolDefinition {
    const apiKey = this.dependencies.getWebSearchApiKey()
    return createWebSearchTool(
      apiKey ? createExaWebSearchProvider({ apiKey, fetch: this.dependencies.fetch }) : undefined,
    )
  }

  private chartToolTarget(tool: RegisteredChartTool, agent: ChartAgentController): object {
    return agent.toolHosts.find((candidate) => tool.owns(candidate)) ?? agent
  }

  private createRegisteredTool(
    tool: RegisteredChartTool,
    agent: ChartAgentController,
  ): RuntimeToolDefinition {
    const sourceIds = agent.getAvailableMarketDataSourceIds()
    const drawingPaneIds = agent.getAvailableDrawingPaneIds()
    const target = this.chartToolTarget(tool, agent)
    return {
      ...tool.config,
      description: this.toolDescription(
        tool.config.name,
        tool.config.description,
        sourceIds,
        drawingPaneIds,
      ),
      reversible: false,
      summarizeInput: tool.summarizeInput,
      execute: async (input, context) => {
        context.signal.throwIfAborted()
        context.progress({ label: `Running ${tool.config.label}`, current: 1, total: 1 })
        let value: unknown
        try {
          value = await tool.execute(target, input, {
            signal: context.signal,
            progress: context.progress,
          })
        } catch (error) {
          const failure =
            (tool.config.name === 'drawing_create' ? drawingCreateFailure(error, agent) : null) ??
            chartToolFailure(error)
          if (!failure) throw error
          return failure
        }
        context.signal.throwIfAborted()
        return {
          content: typeof value === 'string' ? value : JSON.stringify(value),
          summary: Array.isArray(value) ? `Returned ${value.length} items.` : 'Tool completed.',
        }
      },
    }
  }

  private toolDescription(
    name: string,
    description: string,
    sourceIds: ReadonlyArray<string>,
    drawingPaneIds: ReadonlyArray<string>,
  ): string {
    if (name === 'drawing_create') {
      const available = drawingPaneIds.length ? drawingPaneIds.join(', ') : 'none'
      return `${description} Available runtime paneIds: ${available}. Use only one of these exact values for paneId.`
    }
    if (name === 'comparison_create') {
      const available = sourceIds.length ? sourceIds.join(', ') : 'none'
      return `${description} Available runtime sourceIds: ${available}. Set source to one of these exact values when the compared instrument comes from a specific source; omit it to resolve the code across every enabled source. Pass the chart main symbol in primary only to fill omitted routing fields; it never overrides the resolved instrument.`
    }
    if (
      ![
        'instruments_query_name',
        'market_bars_query',
        'market_timeshare_query',
        'market_timeshare_range_query',
      ].includes(name)
    )
      return description
    const available = sourceIds.length ? sourceIds.join(', ') : 'none'
    return `${description} Available runtime sourceIds: ${available}. When providing sourceId or sourceIds, use only these exact values; omit the field to allow automatic routing across every enabled source.`
  }
}

function drawingCreateFailure(
  error: unknown,
  agent: ChartAgentController,
): { content: string; summary: string; failure: AgentErrorView } | null {
  if (!(error instanceof Error)) return null
  const drawingError = error as DrawingCreateError
  const details = drawingError.details
  let detail: DrawingCreateFailureDetail
  switch (drawingError.code) {
    case 'DRAWING_UNKNOWN_PANE':
      detail = {
        code: 'UNKNOWN_PANE_ID',
        message: error.message,
        field: 'paneId',
        expected: agent.getAvailableDrawingPaneIds().join(', '),
        recovery: `Use paneId: ${agent.getAvailableDrawingPaneIds().join(', ')}.`,
      }
      break
    case 'DRAWING_INVALID_ANCHOR_COUNT':
      detail = {
        code: 'INVALID_ANCHOR_COUNT',
        message: error.message,
        field: 'anchors',
        expected: `${details?.expected} anchors for ${details?.kind}`,
        recovery: `Use exactly ${details?.expected} anchors for ${details?.kind}.`,
      }
      break
    case 'DRAWING_ANCHOR_NOT_FOUND':
      detail = {
        code: 'ANCHOR_TIME_NOT_FOUND',
        message: error.message,
        field: 'anchors',
        expected: 'a timestamp present in the loaded chart data',
        recovery: 'Use an anchor timestamp that is present in the loaded chart data.',
      }
      break
    case 'DRAWING_ANCHOR_DATE_OUT_OF_RANGE':
      detail = {
        code: 'ANCHOR_DATE_OUT_OF_RANGE',
        message: error.message,
        field: 'anchors',
        expected: `a trading date between ${details?.earliest} and ${details?.latest}`,
        recovery: `Use a trading date between ${details?.earliest} and ${details?.latest}.`,
      }
      break
    case 'DRAWING_ANCHOR_DATE_NOT_TRADING':
      detail = {
        code: 'ANCHOR_DATE_NOT_TRADING',
        message: error.message,
        field: 'anchors',
        expected: 'a date that has a bar in the loaded chart data',
        recovery: 'Pick a trading date that has a bar in the loaded chart data.',
      }
      break
    case 'DRAWING_ANCHOR_DATE_UNAVAILABLE':
      detail = {
        code: 'ANCHOR_DATE_UNAVAILABLE',
        message: error.message,
        field: 'anchors',
        expected: 'loaded chart data that carries a per-bar date',
        recovery:
          'This dataset exposes no per-bar date; anchor by bar position instead of trading date.',
      }
      break
    case 'DRAWING_INVALID_ANCHOR':
      detail = {
        code: 'INVALID_ANCHOR_VALUE',
        message: error.message,
        field: 'anchors',
        expected: 'a finite price and a valid UTC date',
        recovery: 'Use a finite price and a valid UTC date.',
      }
      break
    default:
      if (!(error instanceof ToolInputValidationError)) return null
      detail = {
        code: error.code,
        message: error.message,
        field: 'input',
        expected: 'valid drawing_create parameters',
        recovery: 'Correct the invalid field and retry drawing_create.',
      }
  }
  const failure = {
    code: detail.code,
    message: detail.message,
    retryable: true,
    recommendedAction: detail.recovery,
  }
  return {
    content: JSON.stringify({ success: false, error: detail, stateChanged: false }),
    summary: failure.message,
    failure,
  }
}

function chartToolFailure(
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
