// 时间线索引：把官方条目流中散落的工具结果、引用与前一条用户输入整理成只读映射。
import {
  type EntryId,
  type EntryRecord,
  KQ_USER_ENTRY_KIND,
  type SourceCitation,
  type ToolResultMessage,
  type TranscriptItem,
} from '../../agent-contracts.js'
import { readCitations } from './tool-view.js'

/** 时间线渲染所需的派生索引，只做查找不做重排。 */
export interface TranscriptIndex {
  /** 工具调用 ID → 已提交的工具结果。 */
  readonly toolResults: ReadonlyMap<string, ToolResultMessage>
  /** 助手条目 → 该轮对应的用户条目，用于重新生成。 */
  readonly retryTargets: ReadonlyMap<EntryId, EntryId>
  /** 全部工具结果携带的来源。 */
  readonly citations: readonly SourceCitation[]
  /** 最后一条助手条目，用于决定操作栏位置。 */
  readonly finalAssistantId?: EntryId
}

/**
 * 遍历官方条目流，建立工具结果、引用与重试目标的查找表。
 * @param items 官方条目窗口。
 * @returns 只读派生索引。
 */
export function indexTranscript(items: readonly TranscriptItem[]): TranscriptIndex {
  const toolResults = new Map<string, ToolResultMessage>()
  const retryTargets = new Map<EntryId, EntryId>()
  const citations: SourceCitation[] = []
  let lastUserEntryId: EntryId | undefined
  let finalAssistantId: EntryId | undefined

  // 第一遍收集工具结果，第二遍按助手条目建立引用与重试目标映射。
  for (const item of items) {
    if (item.kind !== 'entry') continue
    const message = item.entry.model?.[0]
    if (message?.role === 'toolResult') toolResults.set(message.toolCallId, message)
  }

  for (const item of items) {
    if (item.kind !== 'entry') continue
    const entry = item.entry
    if (isUserEntry(entry)) {
      lastUserEntryId = entry.id
      continue
    }
    if (entry.kind !== 'pi.assistant' || entry.model?.[0]?.role !== 'assistant') continue
    if (lastUserEntryId !== undefined) retryTargets.set(entry.id, lastUserEntryId)
    // 只有以回答结束的条目才是"最终答案"；工具轮同样会进入 retryTargets，但不占操作栏。
    if (isAnswerEntry(entry)) finalAssistantId = entry.id
    for (const block of entry.model[0].content) {
      if (block.type !== 'toolCall') continue
      const result = toolResults.get(block.id)
      if (result) citations.push(...readCitations(result.details))
    }
  }

  return {
    toolResults,
    retryTargets,
    citations,
    ...(finalAssistantId === undefined ? {} : { finalAssistantId }),
  }
}

/** 判断条目是否为可渲染的用户消息；兼容旧会话的 `pi.user`。 */
export function isUserEntry(entry: EntryRecord): boolean {
  return (
    (entry.kind === 'pi.user' || entry.kind === KQ_USER_ENTRY_KIND) &&
    entry.model?.[0]?.role === 'user'
  )
}

/** 判断未知值是否为普通对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 读取用户条目原文；`kq.user` 的模型消息含上下文，展示只取 data.prompt。 */
export function userEntryText(entry: EntryRecord): string {
  const data = entry.data
  if (isRecord(data) && typeof data.prompt === 'string') return data.prompt
  const message = entry.model?.[0]
  if (message?.role !== 'user') return ''
  return typeof message.content === 'string'
    ? message.content
    : message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
}

/** 判断条目是否为可渲染的助手回答。 */
export function isAssistantEntry(entry: EntryRecord): boolean {
  return entry.kind === 'pi.assistant' && entry.model?.[0]?.role === 'assistant'
}

/**
 * 判断助手条目是否以「回答」结束：Pi 的 `stopReason` 为 `toolUse` / `pending`
 * 时这一轮还在等工具或还没生成，不算回答；其余原因必须有正文才算。
 */
function isAnswerEntry(entry: EntryRecord): boolean {
  const message = entry.model?.[0]
  if (!isAssistantEntry(entry) || message?.role !== 'assistant') return false
  if (message.stopReason === 'toolUse' || message.stopReason === 'pending') return false
  return answerText(entry).length > 0
}

/** 拼接助手条目的正文，供复制与操作栏判断。 */
export function answerText(entry: EntryRecord): string {
  const message = entry.model?.[0]
  if (message?.role !== 'assistant') return ''
  return message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
}
