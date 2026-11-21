// 时间线索引测试：只有以回答结束的助手条目才是最终答案，工具轮只登记重试目标。
import { describe, expect, it } from 'vitest'
import {
  type AssistantMessage,
  type ConversationId,
  type EntryId,
  type EntryRecord,
  KQ_USER_ENTRY_KIND,
  type TranscriptItem,
} from '../../../agent-contracts.js'
import { indexTranscript, isUserEntry, userEntryText } from '../use-agent-transcript.js'

/** 官方助手消息共用的用量字段。 */
const USAGE: AssistantMessage['usage'] = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
}

/** 一条助手正文，或一个只有工具调用的轮次。 */
const TEXT: AssistantMessage['content'] = [{ type: 'text', text: 'answer' }]
const TOOL_CALL: AssistantMessage['content'] = [
  { type: 'toolCall', id: 'call-1', name: 'ask_user', arguments: {} },
]

/** 构造一条官方用户条目。 */
function user(id: number): EntryRecord {
  return {
    id: id as EntryId,
    conversationId: 1 as ConversationId,
    kind: 'pi.user',
    model: [{ role: 'user', content: 'prompt', timestamp: id }],
  }
}

/** 构造一条应用侧用户条目：模型消息带易变上下文，data 保存原文。 */
function kqUser(id: number, prompt: string): EntryRecord {
  return {
    id: id as EntryId,
    conversationId: 1 as ConversationId,
    kind: KQ_USER_ENTRY_KIND,
    data: { prompt },
    model: [{ role: 'user', content: `Current date...\n\n${prompt}`, timestamp: id }],
  }
}

/** 构造一条官方助手条目。 */
function assistant(
  id: number,
  stopReason: AssistantMessage['stopReason'],
  content: AssistantMessage['content'],
): EntryRecord {
  return {
    id: id as EntryId,
    conversationId: 1 as ConversationId,
    kind: 'pi.assistant',
    model: [
      {
        role: 'assistant',
        content,
        api: 'openai-responses',
        provider: 'fake',
        model: 'fake-model',
        usage: USAGE,
        stopReason,
        timestamp: id,
      },
    ],
  }
}

/** 包装成官方条目流的一行。 */
const item = (entry: EntryRecord): TranscriptItem => ({ kind: 'entry', entry })

describe('indexTranscript', () => {
  it.each<[string, AssistantMessage['stopReason'], AssistantMessage['content'], boolean]>([
    ['stop 且有正文', 'stop', TEXT, true],
    ['length 且有正文', 'length', TEXT, true],
    ['aborted 且有正文', 'aborted', TEXT, true],
    ['toolUse 且有正文', 'toolUse', TEXT, false],
    ['pending 且有正文', 'pending', TEXT, false],
    ['stop 但没有正文', 'stop', [], false],
    ['toolUse 且只有工具调用', 'toolUse', TOOL_CALL, false],
  ])('%s → 最终答案 %s', (_label, stopReason, content, isFinal) => {
    const index = indexTranscript([item(user(1)), item(assistant(2, stopReason, content))])

    expect(index.finalAssistantId).toBe(isFinal ? (2 as EntryId) : undefined)
  })

  it('keeps every assistant round as a retry target', () => {
    const index = indexTranscript([item(user(1)), item(assistant(2, 'toolUse', TOOL_CALL))])

    expect(index.retryTargets.get(2 as EntryId)).toBe(1 as EntryId)
    expect(index.finalAssistantId).toBeUndefined()
  })

  it('renders kq.user from data.prompt and still resolves retry targets', () => {
    const entry = kqUser(1, '写一个均线指标')
    expect(isUserEntry(entry)).toBe(true)
    expect(userEntryText(entry)).toBe('写一个均线指标')

    const index = indexTranscript([item(entry), item(assistant(2, 'stop', TEXT))])
    expect(index.retryTargets.get(2 as EntryId)).toBe(1 as EntryId)
    expect(index.finalAssistantId).toBe(2 as EntryId)
  })
})
