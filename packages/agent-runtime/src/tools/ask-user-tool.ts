// 本文件把「向用户提问并等待答复」封装为阻塞式 Agent 工具，渲染与应答生命周期由宿主实现。
import { type Static, Type } from 'typebox'

import type { QuestionAnswerView, QuestionOptionView } from '../contracts/ui.js'
import type { RuntimeToolDefinition } from '../pi/types.js'

export const ASK_USER_TOOL_NAME = 'ask_user'
export const ASK_USER_TOOL_METADATA = {
  name: ASK_USER_TOOL_NAME,
  label: 'Ask question',
  description:
    'Ask the user a clarifying question in the Agent panel and wait for the answer before continuing. This is required whenever a tool result reports status "ambiguous": turn every candidate into one option, where value is the candidate\'s routing key (for example "tdx|SZSE|stock" from source + exchange + instrumentType), label is its display name, and description explains its source, exchange, and instrumentType. Every value must be unique; labels may repeat. Never answer on the user\'s behalf and never retry with a guessed candidate.',
} as const

const AskUserParameters = Type.Object(
  {
    question: Type.String({ minLength: 1, maxLength: 2000 }),
    multiSelect: Type.Optional(Type.Boolean()),
    options: Type.Array(
      Type.Object(
        {
          value: Type.String({ minLength: 1, maxLength: 200 }),
          label: Type.String({ minLength: 1, maxLength: 200 }),
          description: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
        },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: 8 },
    ),
  },
  { additionalProperties: false },
)

type AskUserInput = Static<typeof AskUserParameters>

/** 一次待展示的提问；option.value 同时是回传给模型的选择值。 */
export interface AskUserRequest {
  readonly prompt: string
  readonly options: readonly QuestionOptionView[]
  readonly multiSelect: boolean
}

/** 宿主提问所需的执行控制信息。 */
export interface AskUserExecutionContext {
  readonly sessionId: string
  readonly runId: string
  readonly toolCallId: string
  readonly signal: AbortSignal
}

/**
 * 提问的处置结果。
 *
 * 取消不是失败：用户主动放弃时工具正常返回 `cancelled`，模型据此停止追问；
 * 若按失败返回，模型会把「没人回答」当成需要重试的错误。
 */
export type AskUserOutcome =
  | { readonly status: 'answered'; readonly answer: QuestionAnswerView }
  | { readonly status: 'cancelled' }

/** 宿主提问通道：渲染提问卡片并挂起到用户答复或取消。 */
export interface AskUserHost {
  request(request: AskUserRequest, context: AskUserExecutionContext): Promise<AskUserOutcome>
}

/** 创建由宿主提问通道支撑的标准澄清工具。 */
export function createAskUserTool(host: AskUserHost): RuntimeToolDefinition {
  return {
    ...ASK_USER_TOOL_METADATA,
    parameters: AskUserParameters,
    effect: 'read',
    executionMode: 'sequential',
    // 这次调用没有可折叠的工具结果，宿主按提问卡片渲染。
    presentation: 'question',
    summarizeInput: (input) => (input as AskUserInput).question,
    async execute(input, context) {
      context.signal.throwIfAborted()
      const request = input as AskUserInput
      const outcome = await host.request(
        {
          prompt: request.question,
          options: request.options,
          multiSelect: request.multiSelect ?? false,
        },
        { runId: context.runId, toolCallId: context.toolCallId, sessionId: context.sessionId, signal: context.signal },
      )
      context.signal.throwIfAborted()
      if (outcome.status === 'cancelled') {
        return {
          content: JSON.stringify({ status: 'cancelled' }),
          summary: 'User declined to answer.',
        }
      }
      const answer = outcome.answer
      return {
        content: JSON.stringify({
          status: 'answered',
          selected: answer.selectedValues,
          ...(answer.note ? { note: answer.note } : {}),
        }),
        summary: answer.selectedValues.length
          ? `User selected: ${answer.selectedValues.join(', ')}.`
          : 'User answered with free text.',
      }
    },
  }
}
