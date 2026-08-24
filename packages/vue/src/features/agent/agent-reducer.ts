/** Project replayed and live Agent events into the single Renderer view state. */
import {
  AGENT_UI_PROTOCOL_VERSION,
  type AgentErrorView,
  type AgentMessageView,
  type AgentRunView,
  type AgentSessionView,
  type AgentUiEvent,
  type ChartContextView,
  type ConfirmationView,
  type ProviderStatusView,
  type ToolCallView,
} from './agent-contracts'

export interface AgentWorkspaceState {
  sessions: AgentSessionView[]
  activeSessionId: string | null
  messages: AgentMessageView[]
  toolCalls: ToolCallView[]
  confirmations: ConfirmationView[]
  run: AgentRunView
  previousRuns: AgentRunView[]
  provider: ProviderStatusView
  context: ChartContextView
  error: AgentErrorView | null
  canUndoTurn: boolean
  announcement: string
}

const IDLE_RUN: AgentRunView = {
  id: null,
  sessionId: null,
  status: 'idle',
}

export function createInitialAgentState(): AgentWorkspaceState {
  return {
    sessions: [],
    activeSessionId: null,
    messages: [],
    toolCalls: [],
    confirmations: [],
    run: IDLE_RUN,
    previousRuns: [],
    provider: {
      state: 'not-configured',
      providerLabel: '302.ai',
    },
    context: {
      symbol: 'BTCUSDT',
      period: '1h',
      visibleRange: 'Latest 7 days',
      selectedBar: null,
      readOnly: false,
    },
    error: null,
    canUndoTurn: false,
    announcement: '',
  }
}

function isRunEvent(event: AgentUiEvent): event is Extract<AgentUiEvent, { runId: string }> {
  return 'runId' in event
}

function updateMessage(
  messages: AgentMessageView[],
  messageId: string,
  update: (message: AgentMessageView) => AgentMessageView,
): AgentMessageView[] {
  return messages.map((message) => (message.id === messageId ? update(message) : message))
}

function upsertTool(tools: ToolCallView[], next: ToolCallView): ToolCallView[] {
  const index = tools.findIndex((tool) => tool.id === next.id)
  if (index < 0) return [...tools, next]
  return tools.map((tool, toolIndex) => (toolIndex === index ? next : tool))
}

function updateTool(
  tools: ToolCallView[],
  toolCallId: string,
  update: (tool: ToolCallView) => ToolCallView,
): ToolCallView[] {
  return tools.map((tool) => (tool.id === toolCallId ? update(tool) : tool))
}

function runHasUndo(tools: ToolCallView[], runId: string): boolean {
  return tools.some(
    (tool) => tool.runId === runId && tool.status === 'succeeded' && Boolean(tool.undoToken),
  )
}

function archiveRun(state: AgentWorkspaceState): AgentRunView[] {
  return state.run.id ? [...state.previousRuns, state.run] : state.previousRuns
}

// follow-ignore-next-line complexity
export function reduceAgentUiEvent(
  state: AgentWorkspaceState,
  event: AgentUiEvent,
): AgentWorkspaceState {
  if (event.protocolVersion !== AGENT_UI_PROTOCOL_VERSION) return state

  if (event.type === 'run.started') {
    return {
      ...state,
      activeSessionId: event.sessionId,
      run: {
        id: event.runId,
        sessionId: event.sessionId,
        status: 'running',
        startedAt: event.startedAt,
      },
      previousRuns: archiveRun(state),
      error: null,
      canUndoTurn: false,
      announcement: 'Agent run started.',
    }
  }

  if (isRunEvent(event) && event.runId !== state.run.id) return state

  switch (event.type) {
    case 'user.message.created':
    case 'action.summary':
      return { ...state, messages: [...state.messages, event.message] }

    case 'assistant.message.started':
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: event.messageId,
            role: 'assistant',
            content: '',
            createdAt: event.createdAt,
            status: 'streaming',
          },
        ],
      }

    case 'assistant.text.delta':
      return {
        ...state,
        messages: updateMessage(state.messages, event.messageId, (message) => ({
          ...message,
          content: `${message.content}${event.delta}`,
        })),
        announcement: event.delta,
      }

    case 'assistant.message.completed':
      return {
        ...state,
        messages: updateMessage(state.messages, event.messageId, (message) => ({
          ...message,
          status: 'complete',
        })),
      }

    case 'assistant.message.failed':
      return {
        ...state,
        messages: updateMessage(state.messages, event.messageId, (message) => ({
          ...message,
          status: 'failed',
        })),
      }

    case 'tool.started':
      return {
        ...state,
        toolCalls: upsertTool(state.toolCalls, event.call),
        announcement: `${event.call.label} started.`,
      }

    case 'tool.progress':
      return {
        ...state,
        toolCalls: updateTool(state.toolCalls, event.toolCallId, (tool) => ({
          ...tool,
          progress: event.progress,
        })),
      }

    case 'tool.confirmation.required':
      return {
        ...state,
        confirmations: [...state.confirmations, event.request],
        toolCalls: updateTool(state.toolCalls, event.request.toolCallId, (tool) => ({
          ...tool,
          status: 'requires-confirmation',
        })),
        announcement: 'Confirmation required.',
      }

    case 'tool.confirmation.resolved': {
      const confirmation = state.confirmations.find((item) => item.id === event.confirmationId)
      if (!confirmation) return state
      return {
        ...state,
        confirmations: state.confirmations.map((item) =>
          item.id === event.confirmationId ? { ...item, status: event.decision } : item,
        ),
        toolCalls: updateTool(state.toolCalls, confirmation.toolCallId, (tool) => ({
          ...tool,
          status: event.decision === 'confirmed' ? 'running' : 'rejected',
        })),
        announcement: event.decision === 'confirmed' ? 'Action confirmed.' : 'Action rejected.',
      }
    }

    case 'tool.finished': {
      const toolCalls = upsertTool(state.toolCalls, event.result)
      return {
        ...state,
        toolCalls,
        canUndoTurn: state.run.id ? runHasUndo(toolCalls, state.run.id) : false,
        announcement: `${event.result.label} ${event.result.status}.`,
      }
    }

    case 'tool.undone':
      return {
        ...state,
        toolCalls: updateTool(state.toolCalls, event.toolCallId, (tool) => ({
          ...tool,
          status: 'undone',
          finishedAt: event.undoneAt,
        })),
        canUndoTurn: false,
        announcement: 'Chart changes undone.',
      }

    case 'run.cancelling':
      return {
        ...state,
        run: { ...state.run, status: 'cancelling' },
        announcement: 'Stopping Agent run.',
      }

    case 'run.cancelled': {
      const messages = state.messages.map((message) =>
        message.status === 'streaming' ? { ...message, status: 'cancelled' as const } : message,
      )
      return {
        ...state,
        messages,
        run: {
          ...state.run,
          status: event.partial ? 'partial' : 'cancelled',
          endedAt: event.endedAt,
        },
        canUndoTurn: state.run.id ? runHasUndo(state.toolCalls, state.run.id) : false,
        announcement: event.partial ? 'Run stopped with partial changes.' : 'Run stopped.',
      }
    }

    case 'run.completed':
      return {
        ...state,
        run: {
          ...state.run,
          status: 'completed',
          endedAt: event.endedAt,
          usage: event.usage,
        },
        canUndoTurn: state.run.id ? runHasUndo(state.toolCalls, state.run.id) : false,
        announcement: 'Agent run completed.',
      }

    case 'run.failed':
      return {
        ...state,
        run: { ...state.run, status: 'failed', endedAt: event.endedAt, error: event.error },
        error: event.error,
        announcement: `Agent run failed: ${event.error.message}`,
      }

    case 'sessions.changed':
      return { ...state, sessions: event.sessions }

    case 'provider.status.changed':
      return { ...state, provider: event.status }

    case 'chart.context.changed':
      return { ...state, context: event.context }
  }
}
