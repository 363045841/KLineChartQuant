// Electron 与测试使用的确定性 Provider 支持：不访问网络，按输入返回固定工具与回答。
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from '@earendil-works/pi-ai'
import { Type } from 'typebox'
import type { RunPlanInput, RuntimeSupport } from '../application/types.js'
import { AgentRuntimeError } from '../contracts/errors.js'
import { withModeGate } from '../host/impl/mode-gate.js'
import type { AgentRunPlan, RuntimeToolDefinition } from '../pi/types.js'

/** 构造 faux 运行时的选项；测试可以直接以已配置状态启动。 */
export interface FauxRuntimeSupportOptions {
  /** 是否把 Provider 视为已配置；默认 false，由测试显式打开。 */
  configured?: boolean
}

export function createFauxRuntimeSupport(options: FauxRuntimeSupportOptions = {}): RuntimeSupport {
  const configured = options.configured ?? false
  const modelLabel = 'KQ Faux Fast'

  const createPlan = (input: RunPlanInput): AgentRunPlan => {
    if (!configured) {
      throw new AgentRuntimeError(
        'PROVIDER_NOT_CONFIGURED',
        'Configure an Agent Provider before starting a run.',
      )
    }
    // continue 没有新正文；给确定性工具一个可读的占位参数，而不是虚构用户输入。
    const request = input.prompt ?? 'Continue the run'
    // 这里只模拟模型选择哪只工具；是否允许执行由宿主 gate 决定，不看 mode。
    const mutation = /add|switch|clear|delete|move|theme/i.test(request)
    const toolName = mutation ? 'chart.preview_change' : 'chart.inspect'
    const faux = fauxProvider({
      tokensPerSecond: mutation ? 18 : 10_000,
      tokenSize: { min: 1, max: 1 },
    })
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall(toolName, { request }, { id: 'scripted-tool-call' }), {
        stopReason: 'toolUse',
      }),
      fauxAssistantMessage(
        mutation
          ? 'The deterministic preview tool completed. The chart mutation adapter will verify this operation in the chart-tool integration stage. '.repeat(
              6,
            )
          : 'The visible chart context was inspected. Momentum is neutral in this deterministic runtime fixture.',
      ),
    ])
    const models = createModels()
    models.setProvider(faux.provider)
    const inspect: RuntimeToolDefinition = {
      name: 'chart.inspect',
      label: 'Inspect chart context',
      description: 'Inspect deterministic chart context.',
      parameters: Type.Object({ request: Type.String() }),
      effect: 'read',
      executionMode: 'parallel',
      summarizeInput: () => request,
      execute: async (_args, context) => {
        context.signal.throwIfAborted()
        context.progress({ label: 'Validating chart scope' })
        return {
          content: 'Deterministic chart evidence returned.',
          summary: 'Chart context inspected.',
          evidence: {
            symbol: 'BTCUSDT',
            period: '1h',
            source: 'Electron faux runtime',
            timezone: 'UTC',
          },
        }
      },
    }
    const preview: RuntimeToolDefinition = {
      name: 'chart.preview_change',
      label: 'Preview chart update',
      description: 'Exercise a write fake Renderer tool.',
      parameters: Type.Object({ request: Type.String() }),
      effect: 'write',
      executionMode: 'sequential',
      summarizeInput: () => request,
      execute: async (_args, context) => {
        context.signal.throwIfAborted()
        context.progress({ label: 'Validating chart scope' })
        return {
          content: 'Preview mutation completed.',
          summary: 'Chart preview changed and verified.',
          evidence: {
            symbol: 'BTCUSDT',
            period: '1h',
            source: 'Electron faux runtime',
            timezone: 'UTC',
          },
        }
      },
    }
    return {
      models,
      model: faux.getModel(),
      // 工具表在会话内固定；plan/build 只决定 gate 是否放行写工具。
      tools: [inspect, preview].map((tool) => withModeGate(tool, input.mode)),
      systemPrompt: 'You are the KLineChartQuant chart analyst. Use only the supplied tools.',
      ...(input.context?.items.length
        ? { turnContext: `Chart context: ${JSON.stringify(input.context.items)}.` }
        : {}),
    }
  }

  return { createPlan }
}
