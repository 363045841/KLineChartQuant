// Electron 与测试使用的确定性 Provider 支持：不访问网络，按输入返回固定工具与回答。
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from '@earendil-works/pi-ai'
import { Type } from 'typebox'
import type { RunPlanInput } from '../application/types.js'
import type { RuntimeSupport } from '../application/unavailable-runtime.js'
import { AgentRuntimeError } from '../contracts/errors.js'
import type {
  ProviderModelsInput,
  ProviderModelsResult,
  ProviderStatusView,
  ProviderTestInput,
  ProviderTestResult,
} from '../contracts/ui.js'
import type { AgentRunPlan, RuntimeToolDefinition } from '../pi/types.js'

export function createFauxRuntimeSupport(): RuntimeSupport {
  let configured = false
  let modelLabel = 'KQ Faux Fast'

  const provider = {
    getStatus(): ProviderStatusView {
      return configured
        ? {
            state: 'connected',
            providerLabel: 'OpenAI-compatible',
            configured: true,
            baseUrl: 'https://api.example.com/v1',
            modelId: modelLabel,
            modelLabel,
            compatibility: 'compatible',
          }
        : {
            state: 'not-configured',
            providerLabel: 'OpenAI-compatible',
            configured: false,
            baseUrl: 'https://api.example.com/v1',
            compatibility: 'unknown',
          }
    },
    async listModels(_input: ProviderModelsInput): Promise<ProviderModelsResult> {
      return {
        models: [{ id: modelLabel, name: modelLabel, compatibility: 'compatible', latencyMs: 1 }],
        refreshedAt: Date.now(),
      }
    },
    async test(input: ProviderTestInput): Promise<ProviderTestResult> {
      configured = true
      modelLabel = input.model
      return {
        compatible: true,
        model: input.model,
        latencyMs: 1,
        ttftMs: 1,
        stages: [
          { stage: 'catalog', ok: true, latencyMs: 1 },
          { stage: 'text', ok: true, latencyMs: 1, ttftMs: 1 },
          { stage: 'tool', ok: true, latencyMs: 1 },
        ],
      }
    },
    async deleteCredential(): Promise<void> {
      configured = false
    },
  }

  const createPlan = (input: RunPlanInput): AgentRunPlan => {
    if (!configured) {
      throw new AgentRuntimeError(
        'PROVIDER_NOT_CONFIGURED',
        'Configure an Agent Provider before starting a run.',
      )
    }
    const mutation =
      input.mode === 'build' && /add|switch|clear|delete|move|theme/i.test(input.prompt)
    const toolName = mutation ? 'chart.preview_change' : 'chart.inspect'
    const faux = fauxProvider({
      tokensPerSecond: mutation ? 18 : 10_000,
      tokenSize: { min: 1, max: 1 },
    })
    faux.setResponses([
      fauxAssistantMessage(
        fauxToolCall(toolName, { request: input.prompt }, { id: 'scripted-tool-call' }),
        { stopReason: 'toolUse' },
      ),
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
    const tool: RuntimeToolDefinition = {
      name: toolName,
      label: mutation ? 'Preview chart update' : 'Inspect chart context',
      description: mutation
        ? 'Exercise a reversible fake Renderer tool.'
        : 'Inspect deterministic chart context.',
      parameters: Type.Object({ request: Type.String() }),
      effect: mutation ? 'write' : 'read',
      executionMode: mutation ? 'sequential' : 'parallel',
      summarizeInput: () => input.prompt,
      execute: async (_args, context) => {
        context.signal.throwIfAborted()
        context.progress({ label: 'Validating chart scope', current: 1, total: 1 })
        return {
          content: mutation
            ? 'Preview mutation completed.'
            : 'Deterministic chart evidence returned.',
          summary: mutation ? 'Chart preview changed and verified.' : 'Chart context inspected.',
          undoToken: mutation ? `undo:${context.runId}` : undefined,
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
      tools: [tool],
      systemPrompt: `You are the KLineChartQuant chart analyst. Current chart context: ${JSON.stringify(input.context?.items ?? [])}.`,
    }
  }

  return { provider, createPlan }
}
