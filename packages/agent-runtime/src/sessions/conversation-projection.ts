// 将官方已提交消息与 pi.live 状态投影为界面快照；不拼接增量、不回放 UI 事件。
import type { AssistantMessage, Message } from '@earendil-works/pi-ai'
import type { ConversationView, EntryRecord, SubmissionRecord } from '@earendil-works/pi-durable'
import type {
  AgentMessageView,
  AgentRunView,
  AgentSessionSnapshot,
  AgentSessionView,
  SourceCitation,
  ToolCallView,
} from '../contracts/ui.js'
import type { RunPersistenceContext } from './types.js'

/** 读取官方 JSON 文档中的对象。 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 缺少可选 JSON 字段时使用空对象。 */
function object(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {}
}

/** 合并文本块，原样保留换行和 Markdown。 */
function text(message: Message): string {
  return typeof message.content === 'string'
    ? message.content
    : message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
}

/** 从工具官方 details 中提取已验证的引用。 */
function citations(value: unknown): SourceCitation[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const row = object(item)
    return typeof row.id === 'string' &&
      typeof row.title === 'string' &&
      typeof row.url === 'string' &&
      typeof row.snippet === 'string'
      ? [
          {
            id: row.id,
            title: row.title,
            url: row.url,
            snippet: row.snippet,
            ...(typeof row.publishedAt === 'string' ? { publishedAt: row.publishedAt } : {}),
          },
        ]
      : []
  })
}

/** 把官方工具 details 和结果消息转换为显示字段。 */
function tool(
  callId: string,
  name: string,
  runId: string,
  details: unknown,
  status: ToolCallView['status'],
  content?: string,
): ToolCallView {
  const result = object(details)
  const presentation = object(result.presentation ?? details)
  const safety = presentation.safety
  const failure = object(result.failure)
  const evidence = object(result.evidence)
  return {
    id: callId,
    runId,
    name,
    label: typeof presentation.label === 'string' ? presentation.label : name,
    inputSummary: typeof presentation.inputSummary === 'string' ? presentation.inputSummary : '',
    safety: safety === 'reversible-write' || safety === 'destructive' ? safety : 'read-only',
    reversible: presentation.reversible === true,
    status,
    resultContent: content,
    evidence: {
      ...(typeof evidence.symbol === 'string' ? { symbol: evidence.symbol } : {}),
      ...(typeof evidence.period === 'string' ? { period: evidence.period } : {}),
      ...(typeof evidence.source === 'string' ? { source: evidence.source } : {}),
      ...(typeof evidence.timezone === 'string' ? { timezone: evidence.timezone } : {}),
      ...(typeof evidence.range === 'string' ? { range: evidence.range } : {}),
      ...(typeof evidence.returned === 'number' ? { returned: evidence.returned } : {}),
    },
    ...(typeof result.summary === 'string' ? { resultSummary: result.summary } : {}),
    ...(typeof result.undoToken === 'string' ? { undoToken: result.undoToken } : {}),
    ...(typeof failure.code === 'string' && typeof failure.message === 'string'
      ? {
          error: {
            code: failure.code,
            message: failure.message,
            retryable: failure.retryable === true,
            ...(typeof failure.raw === 'string' ? { raw: failure.raw } : {}),
            ...(typeof failure.providerCode === 'string'
              ? { providerCode: failure.providerCode }
              : {}),
            ...(typeof failure.recommendedAction === 'string'
              ? { recommendedAction: failure.recommendedAction }
              : {}),
          },
        }
      : {}),
  }
}

/** 完整快照只由官方消息、Submission 和少量宿主运行关联决定。 */
export function projectConversation(
  session: AgentSessionView,
  entries: readonly EntryRecord[],
  view: ConversationView,
  contexts: ReadonlyMap<number, RunPersistenceContext>,
  submissions: readonly SubmissionRecord[],
  hostFailures: ReadonlyMap<string, AgentRunView>,
  contextWindow?: number,
): AgentSessionSnapshot {
  const messages: AgentMessageView[] = []
  const tools = new Map<string, ToolCallView>()
  const runs = new Map<string, AgentRunView>()
  const currentByConversation = new Map<number, RunPersistenceContext>()
  const sources = new Map<string, SourceCitation[]>()
  const submissionByRun = new Map(
    submissions.flatMap((item) => (item.requestId ? [[item.requestId, item] as const] : [])),
  )
  const addAssistant = (
    message: AssistantMessage,
    id: string,
    context: RunPersistenceContext,
    streaming = false,
  ) => {
    message.content.forEach((block, index) => {
      if (block.type === 'thinking')
        messages.push({
          id: `${id}:thinking:${index}`,
          runId: context.runId,
          role: 'reasoning',
          content: block.thinking,
          createdAt: message.timestamp,
          status: streaming ? 'streaming' : 'complete',
        })
      if (block.type === 'toolCall')
        tools.set(block.id, tool(block.id, block.name, context.runId, {}, 'queued'))
    })
    const content = text(message)
    if (content || streaming)
      messages.push({
        id,
        runId: context.runId,
        role: 'assistant',
        content,
        createdAt: message.timestamp,
        status: streaming ? 'streaming' : 'complete',
        citations: sources.get(context.runId),
      })
    if (!streaming) {
      const run = runs.get(context.runId)
      if (run) {
        const usage = message.usage
        runs.set(context.runId, {
          ...run,
          usage: {
            inputTokens:
              (run.usage?.inputTokens ?? 0) + usage.input + usage.cacheRead + usage.cacheWrite,
            outputTokens: (run.usage?.outputTokens ?? 0) + usage.output,
            costUsd: (run.usage?.costUsd ?? 0) + usage.cost.total,
            contextTokens: usage.input + usage.cacheRead + usage.cacheWrite,
          },
        })
      }
    }
  }
  for (const entry of entries) {
    const context = contexts.get(entry.id)
    if (context) {
      currentByConversation.set(entry.conversationId, context)
      // 输入在 Fork 事务内已经持久化，即使 Provider 尚未启动也应显示并允许后续编辑。
      messages.push({
        id: context.userEntryId,
        runId: context.runId,
        role: 'user',
        content: context.prompt,
        createdAt: context.startedAt,
      })
      const submission = submissionByRun.get(context.runId)
      const failed = submission?.status === 'unanswered'
      runs.set(context.runId, {
        id: context.runId,
        sessionId: session.id,
        startedAt: context.startedAt,
        retryOfRunId: context.retryOfRunId,
        editOfRunId: context.editOfRunId,
        status:
          submission?.status === 'done'
            ? 'completed'
            : failed
              ? submission.reason === 'aborted'
                ? 'cancelled'
                : 'failed'
              : 'running',
        ...(failed && submission.reason !== 'aborted'
          ? {
              error: {
                code: 'PROVIDER_ERROR',
                message:
                  typeof submission.detail === 'string' ? submission.detail : submission.reason,
                retryable: true,
              },
            }
          : {}),
        ...hostFailures.get(context.runId),
      })
    }
    const current = currentByConversation.get(entry.conversationId)
    if (!current) continue
    for (const message of entry.model ?? []) {
      if (message.role === 'assistant') addAssistant(message, String(entry.id), current)
      if (message.role === 'toolResult') {
        tools.set(
          message.toolCallId,
          tool(
            message.toolCallId,
            message.toolName,
            current.runId,
            message.details,
            message.isError ? 'failed' : 'succeeded',
            text(message),
          ),
        )
        sources.set(current.runId, [
          ...(sources.get(current.runId) ?? []),
          ...citations(object(message.details).citations),
        ])
      }
    }
  }
  const live = object(view.docs['pi.live'])
  const current = currentByConversation.get(view.conversation.id)
  if (current) {
    const generation = object(live.generation)
    const partial = object(generation.message)
    const content = Array.isArray(partial.content) ? partial.content : []
    // 官方 live 文档已经包含完整 partial，直接替换投影，不消费 delta。
    const liveId = `live:${current.runId}`
    if (generation.message) {
      const createdAt =
        typeof partial.timestamp === 'number' ? partial.timestamp : current.startedAt
      content.forEach((block, index) => {
        const row = object(block)
        if (row.type === 'thinking' && typeof row.thinking === 'string')
          messages.push({
            id: `${liveId}:thinking:${index}`,
            runId: current.runId,
            role: 'reasoning',
            content: row.thinking,
            createdAt,
            status: 'streaming',
          })
      })
      messages.push({
        id: liveId,
        runId: current.runId,
        role: 'assistant',
        content: content
          .flatMap((block) => {
            const row = object(block)
            return row.type === 'text' && typeof row.text === 'string' ? [row.text] : []
          })
          .join(''),
        createdAt,
        status: 'streaming',
        citations: sources.get(current.runId),
      })
    }
    for (const slot of Array.isArray(live.tools) ? live.tools : []) {
      const row = object(slot)
      if (typeof row.callId !== 'string' || typeof row.name !== 'string' || row.status === 'done')
        continue
      const next = tool(
        row.callId,
        row.name,
        current.runId,
        row.details,
        row.status === 'running' ? 'running' : 'queued',
      )
      tools.set(row.callId, {
        ...next,
        ...(typeof row.output === 'string' && row.output
          ? { progress: { label: row.output } }
          : {}),
      })
    }
  }
  for (const [id, run] of runs) {
    const displayed = run.usage
      ? {
          ...run,
          usage: {
            ...run.usage,
            ...(run.endedAt === undefined || run.startedAt === undefined
              ? {}
              : { durationMs: Math.max(0, run.endedAt - run.startedAt) }),
            ...(id === current?.runId && contextWindow ? { contextWindow } : {}),
          },
        }
      : run
    runs.set(id, displayed)
    if (
      run.status === 'cancelled' &&
      [...tools.values()].some(
        (item) => item.runId === id && item.status === 'succeeded' && item.reversible,
      )
    )
      runs.set(id, { ...displayed, status: 'partial' })
  }
  return {
    session,
    messages,
    toolCalls: [...tools.values()],
    runs: [...runs.values()],
  }
}
