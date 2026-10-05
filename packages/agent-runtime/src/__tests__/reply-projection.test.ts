// 验证完整消息快照的重新生成投影保留历史位置。
import { describe, expect, it } from 'vitest'
import type { AgentMessageView } from '../contracts/ui'
import { projectReply } from '../sessions/reply-projection'

describe('regenerated reply projection', () => {
  it('replaces the selected reply in place across repeated regeneration', () => {
    let messages: AgentMessageView[] = [
      { id: 'user', role: 'user', content: 'Question', createdAt: 1 },
      { id: 'old', runId: 'original', role: 'assistant', content: 'Old answer', createdAt: 2 },
      { id: 'later', role: 'user', content: 'Later question', createdAt: 3 },
    ]
    let source = 'original'
    for (const runId of ['retry', 'retry-again']) {
      messages = projectReply(
        messages,
        {
          id: runId,
          runId,
          role: 'assistant',
          content: 'New answer',
          createdAt: 5,
          status: 'complete',
        },
        source,
      )
      source = runId
    }
    expect(messages.map((message) => message.id)).toEqual(['user', 'retry-again', 'later'])
    expect(messages[1]).toMatchObject({
      createdAt: 2,
      content: 'New answer',
      runId: 'retry-again',
      status: 'complete',
    })
  })
})
