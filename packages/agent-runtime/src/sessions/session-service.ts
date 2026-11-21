// 会话服务：Pi 官方会话之上的薄封装，只维护会话标题与运行、分支入口。
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import type { UserMessage } from '@earendil-works/pi-ai'
import type {
  Conversation,
  ConversationId,
  ConversationRecord,
  ConversationView,
  Cursor,
  EntryId,
  EntryQuery,
  EntryRecord,
  Page,
} from '@earendil-works/pi-durable'
import { AgentRuntimeError } from '../contracts/errors.js'
import type { AgentSessionView } from '../contracts/ui.js'
import { continueAgentRun, type DurableExecution, submitAgentRun } from '../pi/impl/run.js'
import type { AgentRunPlan } from '../pi/types.js'
import {
  LEGACY_MAIN_LANE,
  LegacySessionIdentityDoc,
  readLegacyUpdatedAt,
} from './legacy-session.js'
import { KqSessionDoc } from './session-docs.js'

/** 会话目录分页大小。 */
const SESSION_SCAN_PAGE_SIZE = 100
/** 旧版元数据回填时的条目分页大小。 */
const LEGACY_SCAN_PAGE_SIZE = 100
/** 新建会话的默认标题。 */
const DEFAULT_SESSION_TITLE = 'New session'

export interface AgentSessionServiceOptions {
  execution: DurableExecution
  /** 运行标识生成器；默认使用随机 UUID。 */
  id?: () => string
  now?: () => number
}

/** 一次订阅的初始视图与停止函数。 */
export interface AgentSessionWatch {
  readonly conversation: Conversation
  readonly view: ConversationView
  readonly title: string
  readonly stop: () => Promise<void>
}

/**
 * 把字符串会话标识还原为官方会话 ID。
 * 会话标识就是官方数值 ID 的十进制字符串，这是唯一的品牌类型边界。
 * @param sessionId 会话标识。
 * @returns 官方会话 ID。
 */
function parseSessionId(sessionId: string): ConversationId {
  const value = Number(sessionId)
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new AgentRuntimeError('SESSION_NOT_FOUND', 'The Agent session id is invalid.')
  }
  return value as ConversationId
}

/**
 * 提取用户消息正文。
 * @param message 官方用户消息。
 * @returns 纯文本正文。
 */
function userText(message: UserMessage): string {
  return typeof message.content === 'string'
    ? message.content
    : message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
}

/** 判断未知值是否为普通对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 读取用户条目的展示原文。
 *
 * 应用侧 `kq.user` 把易变上下文留在模型消息里，`data.prompt` 保存用户原文；
 * 旧会话的 `pi.user` 没有 data，直接使用模型消息正文。
 */
function entryPrompt(entry: EntryRecord, message: UserMessage): string {
  if (isRecord(entry.data) && typeof entry.data.prompt === 'string') return entry.data.prompt
  return userText(message)
}

export class AgentSessionService {
  private readonly execution: DurableExecution
  private readonly id: () => string
  private readonly now: () => number

  constructor(options: AgentSessionServiceOptions) {
    this.execution = options.execution
    this.id = options.id ?? (() => globalThis.crypto.randomUUID())
    this.now = options.now ?? Date.now
  }

  /** 返回带 KQ 会话文档的会话目录，按最近活动时间倒序。 */
  async list(): Promise<AgentSessionView[]> {
    const records = await this.scanConversations()
    const views: AgentSessionView[] = []
    for (const record of records) {
      if (record.owner !== undefined) continue
      const doc = await this.execution.harness.snapshot(KqSessionDoc, record.id, BACKGROUND_CONTEXT)
      if (!doc) continue
      views.push({ id: String(record.id), title: doc.title, updatedAt: doc.updatedAt })
    }
    return views.sort((left, right) => right.updatedAt - left.updatedAt)
  }

  /**
   * 回填已发布版本写入的会话：为缺少 `KqSessionDoc` 的主分支会话补上标题与最近活动时间。
   * 幂等：已有新会话文档、已删除或属于旧分支的会话都跳过。
   */
  async adoptLegacySessions(): Promise<void> {
    for (const record of await this.scanConversations()) {
      if (record.owner !== undefined) continue
      const current = await this.execution.harness.snapshot(
        KqSessionDoc,
        record.id,
        BACKGROUND_CONTEXT,
      )
      if (current) continue
      const identity = await this.execution.harness.snapshot(
        LegacySessionIdentityDoc,
        record.id,
        BACKGROUND_CONTEXT,
      )
      if (!identity || identity.lane !== LEGACY_MAIN_LANE || identity.deleted) continue
      const updatedAt = await this.legacyUpdatedAt(record.id)
      if (updatedAt === undefined) continue
      await this.execution.harness.commit(async (tx) => {
        const doc = await tx.doc(KqSessionDoc, record.id)
        doc.title = identity.title
        doc.updatedAt = updatedAt
      }, BACKGROUND_CONTEXT)
    }
  }

  /**
   * 创建主会话并写入标题文档。
   * @param title 会话标题；空标题使用默认名称。
   * @returns 新建会话目录项。
   */
  async create(title: string): Promise<AgentSessionView> {
    const value = title.trim() || DEFAULT_SESSION_TITLE
    const updatedAt = this.now()
    const conversation = await this.execution.harness.createConversation(
      {
        ownership: { kind: 'ownerless' },
        init: async (tx, conversationId) => {
          const doc = await tx.doc(KqSessionDoc, conversationId)
          doc.title = value
          doc.updatedAt = updatedAt
        },
      },
      BACKGROUND_CONTEXT,
    )
    return { id: String(conversation.id), title: value, updatedAt }
  }

  /**
   * 重命名会话并刷新最近活动时间。
   * @param sessionId 会话标识。
   * @param title 新标题。
   */
  async rename(sessionId: string, title: string): Promise<void> {
    const value = title.trim()
    if (!value) throw new AgentRuntimeError('INVALID_PAYLOAD', 'The session title is required.')
    const conversation = await this.conversation(sessionId)
    await this.writeSessionDoc(conversation.id, value)
  }

  /** 退休会话文档即从目录移除；官方历史记录保留在存储中。 */
  async delete(sessionId: string): Promise<void> {
    const conversation = await this.conversation(sessionId)
    await this.execution.harness.commit(
      (tx) => tx.retireDoc(KqSessionDoc, conversation.id),
      BACKGROUND_CONTEXT,
    )
  }

  /**
   * 订阅一个会话的官方视图。
   * @param sessionId 会话标识。
   * @param listener 每次官方视图变更的回调。
   * @returns 初始视图、标题与停止函数。
   */
  async watch(
    sessionId: string,
    listener: (view: ConversationView, title: string) => void,
  ): Promise<AgentSessionWatch> {
    const conversation = await this.conversation(sessionId)
    const doc = await this.execution.harness.snapshot(
      KqSessionDoc,
      conversation.id,
      BACKGROUND_CONTEXT,
    )
    if (!doc) {
      throw new AgentRuntimeError('SESSION_NOT_FOUND', 'The Agent session does not exist.')
    }
    const watch = await conversation.watch(BACKGROUND_CONTEXT)
    const title = doc.title
    watch.start(async (call) => {
      if (call.kind !== 'value') return
      listener(call.value, title)
    })
    return {
      conversation,
      view: watch.value,
      title,
      stop: async () => {
        await watch.stop()
      },
    }
  }

  /**
   * 读取会话的分页条目（官方 fork 感知历史）。
   * @param sessionId 会话标识。
   * @param query 官方条目查询条件。
   * @param limit 单页条目数上限。
   */
  async entries(
    sessionId: string,
    query: Omit<EntryQuery, 'conversationId'>,
    limit: number,
  ): Promise<Page<EntryRecord, Cursor>> {
    const conversation = await this.conversation(sessionId)
    return conversation.entries(query, limit, undefined, BACKGROUND_CONTEXT)
  }

  /**
   * 读取一个用户条目的正文，供重新生成与编辑重发使用。
   * @param entryId 用户条目 ID。
   * @returns 用户输入原文。
   */
  async readUserPrompt(entryId: EntryId): Promise<string> {
    const entry = await this.execution.harness.commit((tx) => tx.entry(entryId), BACKGROUND_CONTEXT)
    if (!entry) {
      throw new AgentRuntimeError('INVALID_PAYLOAD', 'The edited message is not in the session.')
    }
    const message = entry.model?.[0]
    if (!message || message.role !== 'user') {
      throw new AgentRuntimeError('INVALID_PAYLOAD', 'The edited message is not a user message.')
    }
    return entryPrompt(entry, message)
  }

  /**
   * 提交一次运行。
   * @param sessionId 会话标识。
   * @param prompt 用户输入正文。
   * @param plan 本次运行计划。
   * @returns 运行标识。
   */
  async startRun(
    sessionId: string,
    prompt: string,
    plan: AgentRunPlan,
  ): Promise<{ runId: string }> {
    const conversation = await this.conversation(sessionId)
    const runId = this.id()
    await this.writeSessionDoc(conversation.id)
    const submission = await submitAgentRun(this.execution, conversation, plan, {
      runId,
      sessionId,
      prompt,
    })
    // 等待句柄让运行错误可被宿主观测，调度本身由官方 Harness 推进。
    void submission.wait(BACKGROUND_CONTEXT).catch(() => undefined)
    return { runId }
  }

  /**
   * 在会话现有上下文上继续运行：不追加用户消息，也不创建分支。
   * @param sessionId 会话标识。
   * @param plan 本次运行计划。
   * @returns 运行标识。
   */
  async continue(sessionId: string, plan: AgentRunPlan): Promise<{ runId: string }> {
    const conversation = await this.conversation(sessionId)
    const runId = this.id()
    await this.writeSessionDoc(conversation.id)
    const submission = await continueAgentRun(this.execution, conversation, plan, {
      runId,
      sessionId,
    })
    // 等待句柄让运行错误可被宿主观测，调度本身由官方 Harness 推进。
    void submission.wait(BACKGROUND_CONTEXT).catch(() => undefined)
    return { runId }
  }

  /** 中止会话当前运行：官方实现会撤回排队输入并等待任务结束。 */
  async cancel(sessionId: string): Promise<void> {
    const conversation = await this.conversation(sessionId)
    await conversation.abort(BACKGROUND_CONTEXT)
  }

  /**
   * 在该用户条目之前的官方边界创建分支并提交原文，用于重新生成。
   * @param sessionId 原会话标识。
   * @param entryId 需要重跑的用户条目。
   * @param prompt 原用户输入。
   * @param plan 本次运行计划。
   * @returns 新会话标识与运行标识。
   */
  async retry(
    sessionId: string,
    entryId: EntryId,
    prompt: string,
    plan: AgentRunPlan,
  ): Promise<{ sessionId: string; runId: string }> {
    return this.branchAndRun(sessionId, entryId, prompt, plan)
  }

  /**
   * 在该用户条目之前的官方边界创建分支并提交新正文，用于编辑重发。
   * @param sessionId 原会话标识。
   * @param entryId 被编辑的用户条目。
   * @param prompt 新用户输入。
   * @param plan 本次运行计划。
   * @returns 新会话标识与运行标识。
   */
  async edit(
    sessionId: string,
    entryId: EntryId,
    prompt: string,
    plan: AgentRunPlan,
  ): Promise<{ sessionId: string; runId: string }> {
    return this.branchAndRun(sessionId, entryId, prompt, plan)
  }

  /** 读取会话句柄，不存在时抛出 SESSION_NOT_FOUND。 */
  private async conversation(sessionId: string): Promise<Conversation> {
    const conversation = await this.execution.harness.conversation(
      parseSessionId(sessionId),
      BACKGROUND_CONTEXT,
    )
    if (!conversation) {
      throw new AgentRuntimeError('SESSION_NOT_FOUND', 'The Agent session does not exist.')
    }
    return conversation
  }

  /** 写入会话标题与最近活动时间；标题保持不变时只更新时间。 */
  private async writeSessionDoc(conversationId: ConversationId, title?: string): Promise<void> {
    const updatedAt = this.now()
    await this.execution.harness.commit(async (tx) => {
      const doc = await tx.doc(KqSessionDoc, conversationId)
      if (title !== undefined) doc.title = title
      doc.updatedAt = updatedAt
    }, BACKGROUND_CONTEXT)
  }

  /** 分页扫描全部官方会话记录。 */
  private async scanConversations(): Promise<ConversationRecord[]> {
    const records: ConversationRecord[] = []
    let cursor: Cursor | undefined
    do {
      const page = await this.execution.harness.commit(
        (tx) => tx.scanConversations({ order: 'ascending' }, SESSION_SCAN_PAGE_SIZE, cursor),
        BACKGROUND_CONTEXT,
      )
      records.push(...page.items)
      cursor = page.next
    } while (cursor !== undefined)
    return records
  }

  /** 从最新条目向前分页查找旧版元数据记录中的最近活动时间。 */
  private async legacyUpdatedAt(conversationId: ConversationId): Promise<number | undefined> {
    let cursor: Cursor | undefined
    do {
      const page = await this.execution.harness.commit(
        (tx) =>
          tx.scanEntries({ conversationId, order: 'descending' }, LEGACY_SCAN_PAGE_SIZE, cursor),
        BACKGROUND_CONTEXT,
      )
      for (const entry of page.items) {
        const updatedAt = readLegacyUpdatedAt(entry)
        if (updatedAt !== undefined) return updatedAt
      }
      cursor = page.next
    } while (cursor !== undefined)
    return undefined
  }

  /**
   * 找到用户条目之前可继承的官方边界并创建分支。
   * 用户条目是首条历史时没有可继承边界，直接新建会话并复制标题。
   */
  private async branchAndRun(
    sessionId: string,
    entryId: EntryId,
    prompt: string,
    plan: AgentRunPlan,
  ): Promise<{ sessionId: string; runId: string }> {
    const source = await this.conversation(sessionId)
    const sourceDoc = await this.execution.harness.snapshot(
      KqSessionDoc,
      source.id,
      BACKGROUND_CONTEXT,
    )
    if (!sourceDoc) {
      throw new AgentRuntimeError('SESSION_NOT_FOUND', 'The Agent session does not exist.')
    }
    const page = await source.entries(
      { maxEntryId: entryId, order: 'descending' },
      2,
      undefined,
      BACKGROUND_CONTEXT,
    )
    if (!page.items.some((item) => item.id === entryId)) {
      throw new AgentRuntimeError('INVALID_PAYLOAD', 'The edited message is not in the session.')
    }
    const predecessor = page.items.find((item) => item.id < entryId)
    const branch = predecessor
      ? await source.fork(predecessor.id, { ownership: { kind: 'ownerless' } }, BACKGROUND_CONTEXT)
      : await this.execution.harness.createConversation(
          { ownership: { kind: 'ownerless' } },
          BACKGROUND_CONTEXT,
        )
    const runId = this.id()
    const updatedAt = this.now()
    await this.execution.harness.commit(async (tx) => {
      const doc = await tx.doc(KqSessionDoc, branch.id)
      doc.title = sourceDoc.title
      doc.updatedAt = updatedAt
      // 源会话从目录移除，保留的官方历史仍可通过分支追溯。
      await tx.retireDoc(KqSessionDoc, source.id)
    }, BACKGROUND_CONTEXT)
    const submission = await submitAgentRun(this.execution, branch, plan, {
      runId,
      sessionId: String(branch.id),
      prompt,
    })
    void submission.wait(BACKGROUND_CONTEXT).catch(() => undefined)
    return { sessionId: String(branch.id), runId }
  }
}
