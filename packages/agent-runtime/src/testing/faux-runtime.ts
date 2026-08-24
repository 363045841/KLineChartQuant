import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from '@earendil-works/pi-ai'
import { Type } from 'typebox'

import { AgentRuntimeError } from '../contracts/errors.js'

import type { AgentApplicationServiceOptions } from '../application/types.js'
import type { RuntimeSupport } from '../application/unavailable-runtime.js'
import type {
  ProviderModelsInput,
  ProviderModelsResult,
  ProviderStatusView,
  ProviderTestInput,
  ProviderTestResult,
} from '../contracts/ui.js'
import type { PiRunPlan, RuntimeToolDefinition } from '../pi/types.js'

export function createFauxRuntimeSupport(): RuntimeSupport {
  let configured = false
  let modelLabel = 'KQ Faux Fast'

  const provider = {
    getStatus(): ProviderStatusView {
      return configured
        ? {
            state: 'connected',
            providerLabel: '302.ai',
            configured: true,
            baseUrl: 'https://api.302.ai/v1',
            modelId: modelLabel,
            modelLabel,
            persistenceMode: 'encrypted',
            compatibility: 'compatible',
          }
        : {
            state: 'not-configured',
            providerLabel: '302.ai',
            configured: false,
            baseUrl: 'https://api.302.ai/v1',
            persistenceMode: 'encrypted',
            compatibility: 'unknown',
          }
    },
    async listModels(_input: ProviderModelsInput): Promise<ProviderModelsResult> {
      return {
        models: [
          { id: modelLabel, name: modelLabel, compatibility: 'compatible', latencyMs: 1 },
        ],
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

  const createPlan = (
    context: Parameters<AgentApplicationServiceOptions['createPlan']>[0],
  ): PiRunPlan => {
    if (!configured) {
      throw new AgentRuntimeError(
        'PROVIDER_NOT_CONFIGURED',
        'Configure an Agent Provider before starting a run.',
      )
    }
    const mutation = !context.readOnly && /add|switch|clear|delete|move|theme/i.test(context.prompt)
    const toolName = mutation ? 'chart.preview_change' : 'chart.inspect'
    const faux = fauxProvider({
      tokensPerSecond: mutation ? 18 : 10_000,
      tokenSize: { min: 1, max: 1 },
    })
    faux.setResponses([
      fauxAssistantMessage(
        fauxToolCall(toolName, { request: context.prompt }, { id: 'scripted-tool-call' }),
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
      safety: mutation ? 'reversible-write' : 'read-only',
      reversible: mutation,
      executionMode: mutation ? 'sequential' : 'parallel',
      summarizeInput: () => context.prompt,
      execute: async (_input, toolContext) => {
        toolContext.signal.throwIfAborted()
        toolContext.progress({ label: 'Validating chart scope', current: 1, total: 1 })
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
      sessionId: context.sessionId,
      runId: context.runId,
      turnId: context.turnId,
      prompt: context.prompt,
      readOnly: context.readOnly,
      scope: {
        symbol: 'BTCUSDT',
        period: '1h',
        visibleRange: 'Latest 7 days',
        readOnly: context.readOnly,
      },
      tools: [tool],
      model: faux.getModel(),
      streamFn: models.streamSimple.bind(models),
    }
  }

  return { provider, createPlan }
}
