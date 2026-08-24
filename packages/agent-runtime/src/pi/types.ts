import type { AgentRuntimeError } from '../contracts/errors.js'
import type {
  AgentRunUiEventInput,
  AgentUsageView,
  ChartContextView,
  EvidenceView,
  ToolProgressView,
  ToolSafety,
} from '../contracts/ui.js'
import type { AgentMessage, StreamFn } from '@earendil-works/pi-agent-core'
import type { Model, Api, AssistantMessage } from '@earendil-works/pi-ai'
import type { TSchema } from 'typebox'

export interface RuntimeToolResult {
  content: string
  summary: string
  evidence?: EvidenceView
  undoToken?: string
  usage?: AgentUsageView
}

export interface RuntimeToolDefinition<TParameters extends TSchema = TSchema> {
  name: string
  label: string
  description: string
  parameters: TParameters
  safety: ToolSafety
  reversible: boolean
  executionMode?: 'parallel' | 'sequential'
  summarizeInput?: (input: unknown) => string
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

export interface PiRunPlan {
  sessionId: string
  runId: string
  turnId: string
  prompt: string
  readOnly: boolean
  scope: Readonly<ChartContextView>
  transcript?: readonly AgentMessage[]
  tools: readonly RuntimeToolDefinition[]
  model: Model<Api>
  streamFn: StreamFn
  classifyProviderError?: (message: AssistantMessage) => AgentRuntimeError | undefined
  systemPrompt?: string
  toolTurnLimit?: number
  timeoutMs?: number
}

export interface PiRunResult {
  text: string
  usage?: AgentUsageView
  completedToolCount: number
}

export type PiRunEventSink = (event: AgentRunUiEventInput) => Promise<void> | void
