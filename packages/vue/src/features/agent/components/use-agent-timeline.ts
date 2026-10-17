// 时间线装配：把消息、工具调用与运行合并成按时间排序的条目，并维护自动滚动。

import { computed, nextTick, ref, watch } from 'vue'
import type {
  AgentMessageView,
  AgentRunStatus,
  AgentRunView,
  ConfirmationView,
  QuestionView,
  ToolCallView,
} from '../agent-contracts.js'

/** 确认卡片的用户决定。 */
export type ConfirmationDecision = 'confirmed' | 'rejected'

/** 时间线条目：一次渲染对应一条消息、一次工具调用或一次运行。 */
export type TimelineEntry =
  | {
      kind: 'message'
      id: string
      at: number
      message: AgentMessageView
      /** 是否为该运行的最终回复，决定是否展示操作栏。 */
      showActions: boolean
      /** 与操作栏同排展示的运行用量。 */
      statusRun?: AgentRunView
    }
  | {
      kind: 'tool'
      id: string
      at: number
      tool: ToolCallView
      confirmation?: ConfirmationView
      question?: QuestionView
    }
  | {
      kind: 'run'
      id: string
      at: number
      run: AgentRunView
      /** 是否在时间线上展示运行用量。 */
      showStatus: boolean
    }

/** 时间线装配所需的数据源。 */
export interface AgentTimelineSource {
  messages: AgentMessageView[]
  toolCalls: ToolCallView[]
  confirmations: ConfirmationView[]
  questions: QuestionView[]
  run: AgentRunView
  runs: AgentRunView[]
}

/** 已结束的运行状态。 */
const TERMINAL_RUN_STATUSES: readonly AgentRunStatus[] = [
  'completed',
  'failed',
  'cancelled',
  'partial',
  'interrupted',
]

/** 距底部超过该像素值即视为用户已离开最新消息。 */
const AUTO_SCROLL_AWAY_PX = 48

/**
 * 装配时间线条目并维护自动滚动。
 * @param source 时间线数据源
 * @returns 滚动容器引用、有序条目、运行中标记与滚动同步函数
 */
export function useAgentTimeline(source: AgentTimelineSource) {
  const scroller = ref<HTMLElement | null>(null)
  let shouldAutoScroll = true

  const isTerminal = computed(() => TERMINAL_RUN_STATUSES.includes(source.run.status))
  const isLoading = computed(() => !isTerminal.value && source.run.status !== 'idle')

  /** 是否为某次运行的最后一条已完成助手回复。 */
  function isFinalReply(message: AgentMessageView): boolean {
    if (message.role !== 'assistant' || message.status !== 'complete' || !message.runId)
      return false
    const run = source.runs.find((item) => item.id === message.runId)
    if (run?.status !== 'completed') return false
    return !source.messages
      .slice(source.messages.indexOf(message) + 1)
      .some((item) => item.role === 'assistant' && item.runId === message.runId)
  }

  /** 某次运行是否已有最终回复，用于避免运行用量重复展示。 */
  function hasFinalReply(runId: string | null): boolean {
    return source.messages.some((message) => message.runId === runId && isFinalReply(message))
  }

  /** 工具调用对应的确认请求。 */
  function confirmationFor(toolCallId: string): ConfirmationView | undefined {
    return source.confirmations.find((item) => item.toolCallId === toolCallId)
  }

  /** 工具调用对应的提问请求。 */
  function questionFor(toolCallId: string): QuestionView | undefined {
    return source.questions.find((item) => item.toolCallId === toolCallId)
  }

  // 消息按创建时间、工具按开始时间、运行按结束时间参与排序。
  const entries = computed<TimelineEntry[]>(() =>
    [
      ...source.messages.map((message) => {
        const showActions = isFinalReply(message)
        return {
          kind: 'message' as const,
          id: `message-${message.id}`,
          at: message.createdAt,
          message,
          showActions,
          statusRun: showActions
            ? source.runs.find((run) => run.id === message.runId && run.usage)
            : undefined,
        }
      }),
      ...source.toolCalls.map((tool) => ({
        kind: 'tool' as const,
        id: `tool-${tool.id}`,
        at: tool.startedAt ?? Number.MAX_SAFE_INTEGER,
        tool,
        confirmation: confirmationFor(tool.id),
        question: questionFor(tool.id),
      })),
      ...source.runs
        .filter(
          (run) =>
            run.id &&
            !source.runs.some((replacement) => replacement.retryOfRunId === run.id) &&
            (run.usage || (run.id === source.run.id && source.run.status !== 'idle')),
        )
        .map((run) => ({
          kind: 'run' as const,
          id: `run-${run.id}`,
          at: run.endedAt ?? Number.MAX_SAFE_INTEGER,
          run,
          showStatus: Boolean(run.usage) && !hasFinalReply(run.id),
        })),
    ].sort((left, right) => left.at - right.at),
  )

  /** 用户离开底部后保留当前阅读位置，直到主动滚回消息末尾。 */
  function updateAutoScroll(): void {
    const element = scroller.value
    if (!element) return
    shouldAutoScroll =
      element.scrollHeight - element.scrollTop - element.clientHeight <= AUTO_SCROLL_AWAY_PX
  }

  /** 仅在用户正在跟随最新消息时推进视图，避免流式输出打断历史阅读。 */
  function scrollToLatest(): void {
    if (!shouldAutoScroll) return
    const element = scroller.value
    if (!element) return
    element.scrollTop = element.scrollHeight
  }

  watch(
    () => [
      source.messages.length,
      source.toolCalls.length,
      source.confirmations.length,
      source.questions.length,
      source.run.status,
    ],
    async () => {
      await nextTick()
      scrollToLatest()
    },
  )

  return { scroller, entries, isLoading, updateAutoScroll }
}
