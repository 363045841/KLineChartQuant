// 界面状态只保存最新完整会话快照及用户交互状态，不重建模型运行过程。
import type { AgentSessionSnapshot } from '../../agent-contracts.js'
import type { AgentWorkspaceState } from '../types.js'

/** 创建未选择会话的界面状态。 */
export function createWorkspaceState(): AgentWorkspaceState {
  return {
    sessions: [],
    activeSessionId: null,
    messages: [],
    toolCalls: [],
    confirmations: [],
    questions: [],
    run: { id: null, sessionId: null, status: 'idle' },
    previousRuns: [],
    provider: {
      state: 'not-configured',
      providerLabel: 'OpenAI-compatible',
      configured: false,
      compatibility: 'unknown',
    },
    error: null,
    canUndoTurn: false,
    announcement: '',
  }
}

/** 用官方状态的完整投影替换会话显示；Vue 不拼接文本或累计用量。 */
export function displayConversation(
  state: AgentWorkspaceState,
  snapshot: AgentSessionSnapshot,
): AgentWorkspaceState {
  const run = snapshot.runs.at(-1) ?? { id: null, sessionId: null, status: 'idle' as const }
  const changed = state.activeSessionId !== snapshot.session.id
  const visibleTools = new Set(snapshot.toolCalls.map((tool) => tool.id))
  return {
    ...state,
    activeSessionId: snapshot.session.id,
    messages: snapshot.messages,
    toolCalls: snapshot.toolCalls,
    run,
    previousRuns: snapshot.runs.slice(0, -1),
    error: run.error ?? null,
    confirmations: (snapshot.confirmations ?? (changed ? [] : state.confirmations)).filter((item) =>
      visibleTools.has(item.toolCallId),
    ),
    questions: (snapshot.questions ?? (changed ? [] : state.questions)).filter((item) =>
      visibleTools.has(item.toolCallId),
    ),
    canUndoTurn: snapshot.toolCalls.some(
      (tool) => tool.runId === run.id && tool.status === 'succeeded' && Boolean(tool.undoToken),
    ),
    announcement: run.status === 'running' ? '' : (run.error?.message ?? ''),
  }
}
