// 本文件把持久化 UI 事件投影为会话快照。
import type { AgentSessionSnapshot, AgentSessionView, AgentUiEvent } from '../contracts/ui.js'
import { projectReply } from './reply-projection.js'

/** 按事件顺序重建消息、工具和运行状态。 */
export function replaySnapshot(
  session: AgentSessionView,
  events: AgentUiEvent[],
): AgentSessionSnapshot {
  const messages = new Map<string, AgentSessionSnapshot['messages'][number]>()
  const tools = new Map<string, AgentSessionSnapshot['toolCalls'][number]>()
  const runs = new Map<string, AgentSessionSnapshot['runs'][number]>()
  let lastSequence = 0
  for (const event of events) {
    lastSequence = Math.max(lastSequence, event.sequence ?? 0)
    if ('runId' in event) {
      const previous = runs.get(event.runId) ?? {
        id: event.runId,
        sessionId: event.sessionId,
        status: 'idle' as const,
      }
      switch (event.type) {
        case 'run.started':
          runs.set(event.runId, {
            ...previous,
            status: 'running',
            startedAt: event.startedAt,
            retryOfRunId: event.retryOfRunId,
          })
          break
        case 'run.cancelling':
          runs.set(event.runId, { ...previous, status: 'cancelling' })
          break
        case 'run.completed':
          runs.set(event.runId, {
            ...previous,
            status: 'completed',
            endedAt: event.endedAt,
            usage: event.usage,
          })
          break
        case 'run.failed':
          runs.set(event.runId, {
            ...previous,
            status: 'failed',
            endedAt: event.endedAt,
            error: event.error,
          })
          break
        case 'run.interrupted':
          runs.set(event.runId, {
            ...previous,
            status: 'interrupted',
            endedAt: event.endedAt,
            error: event.error,
          })
          break
        case 'run.cancelled':
          runs.set(event.runId, {
            ...previous,
            status: event.partial ? 'partial' : 'cancelled',
            endedAt: event.endedAt,
          })
          break
      }
    }
    if (event.type === 'user.message.created' || event.type === 'action.summary')
      messages.set(event.message.id, event.message)
    if (event.type === 'assistant.message.started' || event.type === 'assistant.thinking.started') {
      const next = projectReply(
        [...messages.values()],
        {
          id: event.messageId,
          runId: event.runId,
          role: event.type === 'assistant.thinking.started' ? 'reasoning' : 'assistant',
          content: '',
          createdAt: event.createdAt,
          status: 'streaming',
        },
        runs.get(event.runId)?.retryOfRunId,
      )
      messages.clear()
      for (const message of next) messages.set(message.id, message)
    }
    if (event.type === 'assistant.text.delta' || event.type === 'assistant.thinking.delta') {
      const message = messages.get(event.messageId)
      if (message)
        messages.set(event.messageId, { ...message, content: `${message.content}${event.delta}` })
    }
    if (
      event.type === 'assistant.message.completed' ||
      event.type === 'assistant.message.failed' ||
      event.type === 'assistant.thinking.completed'
    ) {
      const message = messages.get(event.messageId)
      if (message)
        messages.set(event.messageId, {
          ...message,
          status: event.type === 'assistant.message.failed' ? 'failed' : 'complete',
          ...(event.type === 'assistant.message.completed' && event.citations?.length
            ? { citations: event.citations }
            : {}),
        })
    }
    if (event.type === 'tool.started') tools.set(event.call.id, event.call)
    if (event.type === 'tool.progress') {
      const tool = tools.get(event.toolCallId)
      if (tool) tools.set(event.toolCallId, { ...tool, progress: event.progress })
    }
    if (event.type === 'tool.finished') tools.set(event.result.id, event.result)
    if (event.type === 'tool.undone') {
      const tool = tools.get(event.toolCallId)
      if (tool) tools.set(event.toolCallId, { ...tool, status: 'undone' })
    }
  }
  return {
    session,
    messages: [...messages.values()],
    toolCalls: [...tools.values()],
    runs: [...runs.values()],
    lastSequence,
  }
}
