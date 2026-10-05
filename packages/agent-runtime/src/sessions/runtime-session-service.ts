// 本文件通过 pi-durable 的 Conversation、文档与原子事务管理应用会话。
import type { Context, JsonValue } from '@earendil-works/chord'
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type {
  ConversationId,
  ConversationView,
  ConversationWatch,
  EntryRecord,
  Session,
  Tx,
} from '@earendil-works/pi-durable'
import { AgentRuntimeError } from '../contracts/errors.js'
import {
  type AgentErrorView,
  type AgentSessionSnapshot,
  type AgentSessionView,
} from '../contracts/ui.js'
import { type DurableExecution, DurableRunDriver } from '../pi/impl/durable-run-driver.js'
import { type RedactionOptions, redactString } from '../security/redaction.js'
import { projectConversation } from './conversation-projection.js'
import {
  SESSION_ENTRY,
  SESSION_LANE,
  SESSION_SCAN_PAGE_SIZE,
  SessionIdentityDoc,
  type SessionLane,
  scanAll,
} from './durable-session.js'
import {
  type BeginRunInput,
  KQ_CUSTOM_ENTRY,
  KQ_SESSION_SCHEMA_VERSION,
  type KqRunStartedEntry,
  type KqRunTerminalEntry,
  type RetryRunInput,
  type RunPersistenceContext,
} from './types.js'

export interface RuntimeSessionServiceOptions {
  execution: DurableExecution
  /** 宿主持有底层 Session，负责关闭存储；服务只管理应用会话。 */
  session: Session
  now?: () => number
  id?: () => string
  defaultTitle?: string
  redaction?: RedactionOptions
  context?: Context
}

/** 验证持久化 JSON 对象。 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 将业务载荷编码为官方存储契约要求的 JSON。 */
function json(value: unknown): JsonValue {
  const result: unknown = JSON.parse(JSON.stringify(value))
  if (isJson(result)) return result
  throw new AgentRuntimeError('SESSION_CORRUPT', 'The Agent entry is not JSON-compatible.')
}

/** 递归判断 JSON 值，禁止通过类型断言绕过存储契约。 */
function isJson(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  )
    return true
  if (Array.isArray(value)) return value.every(isJson)
  return isObject(value) && Object.values(value).every(isJson)
}

/** 解码运行起点，保留可选的图表上下文。 */
function runStart(entry: EntryRecord): KqRunStartedEntry {
  const value = entry.data
  if (
    !isObject(value) ||
    value.schemaVersion !== KQ_SESSION_SCHEMA_VERSION ||
    typeof value.runId !== 'string' ||
    typeof value.turnId !== 'string' ||
    typeof value.lane !== 'string' ||
    typeof value.prompt !== 'string' ||
    typeof value.readOnly !== 'boolean' ||
    typeof value.userEntryId !== 'string' ||
    typeof value.startedAt !== 'number'
  ) {
    throw new AgentRuntimeError('SESSION_CORRUPT', 'The Agent run record is invalid.')
  }
  // JSON 解码后的上下文沿用业务边界的结构检查。
  const context = value.context
  if (context !== undefined && (!isObject(context) || !Array.isArray(context.items))) {
    throw new AgentRuntimeError('SESSION_CORRUPT', 'The Agent run context is invalid.')
  }
  const items = context === undefined ? undefined : context.items
  if (
    items !== undefined &&
    (!Array.isArray(items) ||
      !items.every((item) => isObject(item) && typeof item.kind === 'string' && isJson(item.value)))
  )
    throw new AgentRuntimeError('SESSION_CORRUPT', 'The Agent run context is invalid.')
  return {
    schemaVersion: value.schemaVersion,
    runId: value.runId,
    turnId: value.turnId,
    lane: value.lane,
    prompt: value.prompt,
    readOnly: value.readOnly,
    userEntryId: value.userEntryId,
    startedAt: value.startedAt,
    ...(Array.isArray(items) ? { context: { items: items.filter(isContextItem) } } : {}),
    ...(typeof value.retryOfRunId === 'string' ? { retryOfRunId: value.retryOfRunId } : {}),
  }
}

/** 校验已冻结的运行上下文项。 */
function isContextItem(value: unknown): value is { kind: string; value: JsonValue } {
  return isObject(value) && typeof value.kind === 'string' && isJson(value.value)
}

/** 应用会话由主 Conversation 标识，重试使用官方历史 fork。 */
export class RuntimeSessionService {
  private readonly observers = new Map<string, Set<() => Promise<void>>>()
  private readonly execution: DurableExecution
  private readonly session: Session
  private readonly context: Context
  private readonly now: () => number
  private readonly id: () => string
  private readonly defaultTitle: string
  private readonly redaction: RedactionOptions

  /** 接收宿主 Session 与时间、脱敏依赖。 */
  constructor(options: RuntimeSessionServiceOptions) {
    this.execution = options.execution
    this.session = options.session
    this.context = options.context ?? BACKGROUND_CONTEXT
    this.now = options.now ?? Date.now
    this.id = options.id ?? (() => globalThis.crypto.randomUUID())
    this.defaultTitle = options.defaultTitle ?? 'New analysis'
    this.redaction = options.redaction ?? {}
  }

  /** 创建官方 Harness 的 UI 适配器。 */
  createDriver() {
    const execution = this.execution
    return new DurableRunDriver(execution, async (plan) => {
      const lane = await this.requireLane(plan.sessionId)
      const conversation = await execution.harness.conversation(lane.conversationId, this.context)
      if (!conversation)
        throw new AgentRuntimeError('SESSION_NOT_FOUND', 'The current Conversation is missing.')
      return conversation
    })
  }

  /** 订阅官方 Conversation 完整视图，分支切换时重新绑定。 */
  async watchSession(
    sessionId: string,
    listener: (snapshot: AgentSessionSnapshot) => void,
  ): Promise<() => Promise<void>> {
    const execution = this.execution
    let stopped = false
    let watch: ConversationWatch | undefined
    let revision = 0
    let pending = Promise.resolve()
    const refresh = () => {
      pending = pending.then(async () => {
        if (stopped) return
        const lane = await this.requireLane(sessionId)
        if (watch?.value.conversation.id === lane.conversationId) {
          listener(await this.nativeSnapshot(sessionId, watch.value))
          return
        }
        const generation = ++revision
        await watch?.stop()
        const conversation = await execution.harness.conversation(lane.conversationId, this.context)
        if (!conversation)
          throw new AgentRuntimeError('SESSION_NOT_FOUND', 'The current Conversation is missing.')
        watch = await conversation.watch(this.context)
        const initial = await this.nativeSnapshot(sessionId, watch.value)
        if (!stopped && generation === revision) listener(initial)
        watch.start(async (view) => {
          const snapshot = await this.nativeSnapshot(sessionId, view)
          if (!stopped && generation === revision) listener(snapshot)
        })
      })
      return pending
    }
    const observers = this.observers.get(sessionId) ?? new Set()
    observers.add(refresh)
    this.observers.set(sessionId, observers)
    try {
      await refresh()
    } catch (error) {
      observers.delete(refresh)
      await watch?.stop()
      throw error
    }
    return async () => {
      stopped = true
      revision++
      observers.delete(refresh)
      if (!observers.size) this.observers.delete(sessionId)
      await pending
      await watch?.stop()
    }
  }

  /** 分支或目录修改后刷新订阅，消息更新直接由官方 watch 驱动。 */
  private async refreshObservers(sessionId: string): Promise<void> {
    await Promise.all([...(this.observers.get(sessionId) ?? [])].map((refresh) => refresh()))
  }

  /** 从官方记录生成界面快照，不读取任何 UI 事件日志。 */
  private async nativeSnapshot(
    sessionId: string,
    view: ConversationView,
  ): Promise<AgentSessionSnapshot> {
    const main = await this.requireLane(sessionId, SESSION_LANE.main)
    // 当前分支严格使用 watch 的这一帧，避免异步读取时把下一帧的最终消息和旧 partial 同时展示。
    const history = await this.sessionEntries(sessionId)
    const visible = new Map(
      history
        .filter((entry) => entry.conversationId !== view.conversation.id)
        .map((entry) => [entry.id, entry]),
    )
    for (const entry of view.entries) visible.set(entry.id, entry)
    const entries = [...visible.values()].sort((left, right) => left.id - right.id)
    const contexts = new Map(
      entries
        .filter((entry) => entry.kind === KQ_CUSTOM_ENTRY.runStarted)
        .map((entry) => [entry.id, { sessionId, ...runStart(entry) }]),
    )
    const failures = new Map<string, import('../contracts/ui.js').AgentRunView>()
    for (const entry of entries.filter((item) => item.kind === KQ_CUSTOM_ENTRY.runTerminal)) {
      const value = entry.data
      if (!isObject(value) || typeof value.runId !== 'string' || typeof value.endedAt !== 'number')
        continue
      const status = value.status
      if (
        status === 'completed' ||
        status === 'failed' ||
        status === 'interrupted' ||
        status === 'cancelled' ||
        status === 'partial'
      ) {
        const error =
          isObject(value.error) &&
          typeof value.error.code === 'string' &&
          typeof value.error.message === 'string'
            ? {
                code: value.error.code,
                message: value.error.message,
                retryable: value.error.retryable === true,
                ...(typeof value.error.raw === 'string' ? { raw: value.error.raw } : {}),
                ...(typeof value.error.providerCode === 'string'
                  ? { providerCode: value.error.providerCode }
                  : {}),
                ...(typeof value.error.recommendedAction === 'string'
                  ? { recommendedAction: value.error.recommendedAction }
                  : {}),
              }
            : status === 'interrupted'
              ? {
                  code: 'RUN_INTERRUPTED',
                  message: 'The Agent run was interrupted when its host stopped.',
                  retryable: true,
                }
              : undefined
        failures.set(value.runId, {
          id: value.runId,
          sessionId,
          status,
          endedAt: value.endedAt,
          error,
        })
      }
    }
    const submissions = await this.session.commit(async (tx) => {
      const records = await Promise.all(
        entries.flatMap((entry) => {
          const context = contexts.get(entry.id)
          return context ? [tx.submissionByRequest(entry.conversationId, context.runId)] : []
        }),
      )
      return records.filter((record) => record !== undefined)
    }, this.context)
    const agent = view.docs['pi.agent']
    const modelRef = isObject(agent?.model) ? agent.model : undefined
    const model =
      modelRef && typeof modelRef.provider === 'string' && typeof modelRef.modelId === 'string'
        ? this.execution.models.getModel(modelRef.provider, modelRef.modelId)
        : undefined
    return projectConversation(
      await this.view(main),
      entries,
      view,
      contexts,
      submissions,
      failures,
      model?.contextWindow,
    )
  }

  /** 原子创建主 Conversation、身份文档和元数据。 */
  async create(title = this.defaultTitle): Promise<AgentSessionView> {
    const id = this.id()
    const updatedAt = this.now()
    await this.session.commit(async (tx) => {
      const conversation = await tx.createConversation({ ownership: { kind: 'ownerless' } })
      Object.assign(await tx.doc(SessionIdentityDoc, conversation.id), {
        sessionId: id,
        lane: SESSION_LANE.main,
        title,
      })
      await this.touch(tx, conversation.id, updatedAt)
    }, this.context)
    return { id, title, updatedAt }
  }

  /** 返回所有未删除主会话，按最近更新时间排序。 */
  async list(): Promise<AgentSessionView[]> {
    const lanes = await this.lanes()
    const views = await Promise.all(
      lanes
        .filter((lane) => lane.lane === SESSION_LANE.main && !lane.deleted)
        .map((lane) => this.view(lane)),
    )
    return views.sort((left, right) => right.updatedAt - left.updatedAt)
  }

  /** 从官方 Conversation 读取完整快照。 */
  async open(sessionId: string): Promise<AgentSessionSnapshot> {
    const lane = await this.requireLane(sessionId)
    const conversation = await this.execution.harness.conversation(
      lane.conversationId,
      this.context,
    )
    if (!conversation)
      throw new AgentRuntimeError('SESSION_NOT_FOUND', 'The Conversation is missing.')
    const watch = await conversation.watch(this.context)
    try {
      return await this.nativeSnapshot(sessionId, watch.value)
    } finally {
      await watch.stop()
    }
  }

  /** 原子更新主会话标题与更新时间。 */
  async rename(sessionId: string, title: string): Promise<void> {
    const main = await this.requireLane(sessionId, SESSION_LANE.main)
    await this.session.commit(async (tx) => {
      const identity = await tx.doc(SessionIdentityDoc, main.conversationId)
      identity.title = title.trim()
      await this.touch(tx, main.conversationId)
    }, this.context)
    await this.refreshObservers(sessionId)
  }

  /** 标记主会话与全部重试分支删除，避免历史 fork 失去引用。 */
  async delete(sessionId: string): Promise<void> {
    await this.requireLane(sessionId)
    const lanes = (await this.lanes()).filter((lane) => lane.sessionId === sessionId)
    await this.session.commit(async (tx) => {
      for (const lane of lanes)
        (await tx.doc(SessionIdentityDoc, lane.conversationId)).deleted = true
    }, this.context)
  }

  /** 在主 Conversation 中原子写入运行边界、用户消息和运行起点。 */
  async beginRun(input: BeginRunInput): Promise<RunPersistenceContext> {
    const main = await this.requireLane(input.sessionId)
    return this.session.commit(
      (tx) => this.start(tx, main.conversationId, main.lane, input),
      this.context,
    )
  }

  /** 在原用户消息之前的边界 fork，隔离失败运行与后续消息。 */
  async retryRun(input: RetryRunInput): Promise<RunPersistenceContext> {
    const original = await this.findRun(input.originalRunId)
    if (original.sessionId !== input.sessionId)
      throw new AgentRuntimeError(
        'SESSION_NOT_FOUND',
        'The retry source belongs to another session.',
      )
    const source = await this.requireLane(input.sessionId, original.lane)
    const history = await this.entries(source.conversationId)
    const userIndex = history.findIndex((entry) => String(entry.id) === original.userEntryId)
    const boundary = history[userIndex - 1]
    if (!boundary || boundary.kind !== SESSION_ENTRY.boundary)
      throw new AgentRuntimeError('SESSION_CORRUPT', 'The retry source boundary is missing.')
    const lane = `${SESSION_LANE.retryPrefix}${input.runId}`
    const initializeFork = async (tx: Tx, conversationId: ConversationId) => {
      Object.assign(await tx.doc(SessionIdentityDoc, conversationId), {
        sessionId: input.sessionId,
        lane,
        title: source.title,
      })
      return this.start(
        tx,
        conversationId,
        lane,
        { ...original, ...input, prompt: original.prompt, readOnly: original.readOnly },
        input.originalRunId,
      )
    }
    const conversation = await this.execution.harness.conversation(
      source.conversationId,
      this.context,
    )
    if (!conversation)
      throw new AgentRuntimeError('SESSION_NOT_FOUND', 'The retry source Conversation is missing.')
    let record: RunPersistenceContext | undefined
    await conversation.fork(
      boundary.id,
      {
        ownership: { kind: 'ownerless' },
        init: async (tx, id) => {
          record = await initializeFork(tx, id)
        },
      },
      this.context,
    )
    if (!record) throw new AgentRuntimeError('INTERNAL_ERROR', 'Pi did not initialize the fork.')
    await this.refreshObservers(input.sessionId)
    return record
  }

  /** 原子记录终态与主会话更新时间。 */
  async finishRun(
    context: RunPersistenceContext,
    terminal: Omit<KqRunTerminalEntry, 'schemaVersion' | 'runId'>,
    details: { error?: AgentErrorView } = {},
  ): Promise<void> {
    const lane = await this.requireLane(context.sessionId, context.lane)
    const main = await this.requireLane(context.sessionId, SESSION_LANE.main)
    await this.session.commit(async (tx) => {
      await tx.appendEntry(lane.conversationId, {
        kind: KQ_CUSTOM_ENTRY.runTerminal,
        data: json({
          schemaVersion: KQ_SESSION_SCHEMA_VERSION,
          runId: context.runId,
          ...terminal,
          ...(details.error ? { error: details.error } : {}),
        }),
      })
      await this.touch(tx, main.conversationId)
    }, this.context)
  }

  /** 将宿主退出时未结算的运行标记中断，终态与回放事件在同一事务提交。 */
  async recoverInterrupted(): Promise<string[]> {
    // 宿主重启不自动重放图表副作用，先通过官方取消协议结算残留任务。
    const inspection = await this.execution.harness.inspect(this.context)
    const conversations = new Set(inspection.tasks.map((task) => task.record.conversationId))
    for (const id of conversations) {
      await (await this.execution.harness.conversation(id, this.context))?.abort(this.context)
    }
    const interrupted: string[] = []
    for (const view of await this.list()) {
      const entries = await this.sessionEntries(view.id)
      const terminalIds = new Set(
        entries
          .filter((entry) => entry.kind === KQ_CUSTOM_ENTRY.runTerminal)
          .map((entry) => {
            if (!isObject(entry.data) || typeof entry.data.runId !== 'string')
              throw new AgentRuntimeError('SESSION_CORRUPT', 'The terminal run record is invalid.')
            return entry.data.runId
          }),
      )
      for (const entry of entries.filter((entry) => entry.kind === KQ_CUSTOM_ENTRY.runStarted)) {
        const started = runStart(entry)
        if (terminalIds.has(started.runId)) continue
        // Pi 的回答可能已经原子提交，而宿主尚未来得及写入目录时间；保留官方成功终态。
        const submission = await this.session.commit(
          (tx) => tx.submissionByRequest(entry.conversationId, started.runId),
          this.context,
        )
        if (submission?.status === 'done') {
          await this.finishRun(
            { sessionId: view.id, ...started },
            { status: 'completed', endedAt: this.now() },
          )
          continue
        }
        const endedAt = this.now()
        await this.finishRun({ sessionId: view.id, ...started }, { status: 'interrupted', endedAt })
        interrupted.push(started.runId)
      }
    }
    return interrupted
  }

  /** 在全部未删除会话中查找运行起点。 */
  async findRun(runId: string): Promise<RunPersistenceContext> {
    for (const view of await this.list()) {
      for (const entry of (await this.sessionEntries(view.id)).filter(
        (item) => item.kind === KQ_CUSTOM_ENTRY.runStarted,
      )) {
        const started = runStart(entry)
        if (started.runId === runId) return { sessionId: view.id, ...started }
      }
    }
    throw new AgentRuntimeError('RUN_NOT_ACTIVE', 'The requested Agent run does not exist.')
  }

  /** 读取当前分支的继承历史，排除本次用户输入。 */
  async getTranscript(context: RunPersistenceContext): Promise<AgentMessage[]> {
    const lane = await this.requireLane(context.sessionId, context.lane)
    const conversation = await this.execution.harness.conversation(
      lane.conversationId,
      this.context,
    )
    if (!conversation)
      throw new AgentRuntimeError('SESSION_NOT_FOUND', 'The Conversation is missing.')
    return [...(await conversation.context(this.context)).messages]
  }

  /** 完整读取官方 Conversation 分页及对应身份文档。 */
  private async lanes(): Promise<SessionLane[]> {
    const conversations = await this.session.commit(
      (tx) => scanAll((cursor) => tx.scanConversations({}, SESSION_SCAN_PAGE_SIZE, cursor)),
      this.context,
    )
    const lanes: SessionLane[] = []
    for (const conversation of conversations) {
      const identity = await this.session.snapshot(
        SessionIdentityDoc,
        conversation.id,
        this.context,
      )
      if (identity) lanes.push({ conversationId: conversation.id, ...identity })
    }
    return lanes
  }

  /** 查找有效应用会话与分支，删除后不允许继续写入。 */
  private async requireLane(sessionId: string, lane?: string): Promise<SessionLane> {
    const lanes = await this.lanes()
    const main = lanes.find(
      (item) => item.sessionId === sessionId && item.lane === SESSION_LANE.main && !item.deleted,
    )
    if (!main)
      throw new AgentRuntimeError(
        'SESSION_NOT_FOUND',
        'The requested Agent session does not exist.',
      )
    // 当前分支由最后提交的运行起点决定，未开始运行的会话使用主分支。
    const latestRun =
      lane === undefined
        ? (await this.sessionEntries(sessionId))
            .reverse()
            .find((entry) => entry.kind === KQ_CUSTOM_ENTRY.runStarted)
        : undefined
    const selectedLane = lane ?? (latestRun ? runStart(latestRun).lane : SESSION_LANE.main)
    const found = lanes.find(
      (item) => item.sessionId === sessionId && item.lane === selectedLane && !item.deleted,
    )
    if (!found)
      throw new AgentRuntimeError(
        'SESSION_NOT_FOUND',
        'The requested Agent session does not exist.',
      )
    return found
  }

  /** 返回分支继承历史，按官方数值 ID 升序排列。 */
  private entries(conversationId: ConversationId): Promise<EntryRecord[]> {
    return this.session.commit(
      async (tx) =>
        (
          await scanAll((cursor) =>
            tx.scanEntries({ conversationId }, SESSION_SCAN_PAGE_SIZE, cursor),
          )
        ).reverse(),
      this.context,
    )
  }

  /** 合并应用会话所有分支，按全局 Entry ID 去重。 */
  private async sessionEntries(sessionId: string): Promise<EntryRecord[]> {
    const entries = new Map<number, EntryRecord>()
    for (const lane of (await this.lanes()).filter(
      (item) => item.sessionId === sessionId && !item.deleted,
    )) {
      for (const entry of await this.entries(lane.conversationId)) entries.set(entry.id, entry)
    }
    return [...entries.values()].sort((left, right) => left.id - right.id)
  }

  /** 校验最新业务 schema 并构造目录视图。 */
  private async view(lane: SessionLane): Promise<AgentSessionView> {
    const metadata = (await this.entries(lane.conversationId))
      .reverse()
      .find((entry) => entry.kind === KQ_CUSTOM_ENTRY.sessionMetadata)?.data
    if (
      !isObject(metadata) ||
      typeof metadata.schemaVersion !== 'number' ||
      typeof metadata.updatedAt !== 'number'
    )
      throw new AgentRuntimeError('SESSION_CORRUPT', 'The Agent session metadata is invalid.')
    if (metadata.schemaVersion !== KQ_SESSION_SCHEMA_VERSION)
      throw new AgentRuntimeError(
        'SESSION_SCHEMA_UNSUPPORTED',
        'The Agent session schema version is not supported.',
      )
    return { id: lane.sessionId, title: lane.title, updatedAt: metadata.updatedAt }
  }

  /** 在当前事务中追加更新时间。 */
  private async touch(
    tx: Tx,
    conversationId: ConversationId,
    updatedAt = this.now(),
  ): Promise<void> {
    await tx.appendEntry(conversationId, {
      kind: KQ_CUSTOM_ENTRY.sessionMetadata,
      data: { schemaVersion: KQ_SESSION_SCHEMA_VERSION, updatedAt },
    })
  }

  /** 构造并提交一次用户输入与运行记录。 */
  private async start(
    tx: Tx,
    conversationId: ConversationId,
    lane: string,
    input: BeginRunInput,
    retryOfRunId?: string,
  ): Promise<RunPersistenceContext> {
    const prompt = redactString(input.prompt, this.redaction)
    await tx.appendEntry(conversationId, { kind: SESSION_ENTRY.boundary })
    const user = await tx.appendEntry(conversationId, {
      kind: SESSION_ENTRY.message,
    })
    const record: RunPersistenceContext = {
      sessionId: input.sessionId,
      runId: input.runId,
      turnId: input.turnId,
      lane,
      prompt,
      readOnly: input.readOnly,
      userEntryId: String(user.id),
      startedAt: input.startedAt,
      ...(input.context ? { context: input.context } : {}),
      ...(retryOfRunId ? { retryOfRunId } : {}),
    }
    await tx.appendEntry(conversationId, {
      kind: KQ_CUSTOM_ENTRY.runStarted,
      data: json({ schemaVersion: KQ_SESSION_SCHEMA_VERSION, ...record }),
    })
    await this.touch(tx, conversationId)
    return record
  }
}
