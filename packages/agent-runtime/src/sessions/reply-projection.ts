// 本文件统一实时界面与历史回放中的回复替换行为。
import type { AgentMessageView } from '../contracts/ui.js'

/** 重新生成时用新助手回复替换原回复，保留它在时间线中的位置。 */
export function projectReply(
  messages: AgentMessageView[],
  next: AgentMessageView,
  retryOfRunId?: string,
): AgentMessageView[] {
  if (!retryOfRunId || next.role !== 'assistant') return [...messages, next]
  const target = [...messages]
    .reverse()
    .find(
      (message) =>
        message.role === 'assistant' &&
        (message.runId === retryOfRunId || message.runId === next.runId),
    )
  if (!target) return [...messages, next]
  return messages.flatMap((message) => {
    if (message.id === target.id) return [{ ...next, createdAt: target.createdAt }]
    if (
      message.role === 'assistant' &&
      (message.runId === retryOfRunId || message.runId === next.runId)
    )
      return []
    return [message]
  })
}
