// 本文件把「向用户提问并等待答复」封装为阻塞式 Agent 工具，渲染与应答生命周期由宿主实现。
import { Type, type Static } from 'typebox'

import type { QuestionAnswerView, QuestionOptionView } from '../contracts/ui.js'
import type { RuntimeToolDefinition } from '../pi/types.js'

export const ASK_USER_TOOL_NAME = 'ask_user'
export const ASK_USER_TOOL_METADATA = {
  name: ASK_USER_TOOL_NAME,
  label: 'Ask question',
  description:
    'Ask the user a clarifying question in the Agent panel and wait for the answer before continuing. This is required whenever a tool result reports status "ambiguous": turn every candidate into one option (label = instrument name, description = its source, exchange, and assetClass routing fields). Never answer on the user\'s behalf and never retry with a guessed candidate.',
} as const

const AskUserParameters = Type.Object(
  {
    question: Type.String({ minLength: 1, maxLength: 2000 }),
    multiSelect: Type.Optional(Type.Boolean()),
    options: Type.Array(
      Type.Object(
        {
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

/** 一次待展示的提问；label 同时是回传给模型的选择值。 */
export interface AskUserRequest {
  readonly prompt: string
  readonly options: readonly QuestionOptionView[]
  readonly multiSelect: boolean
}

/** 宿主提问所需的执行控制信息。 */
export interface AskUserExecutionContext {
  readonly runId: string
  readonly toolCallId: string
  readonly signal: AbortSignal
}

/** 宿主提问通道：渲染提问卡片并挂起到用户答复；signal 中止时由宿主以 ABORTED 拒绝。 */
export interface AskUserHost {
  request(request: AskUserRequest, context: AskUserExecutionContext): Promise<QuestionAnswerView>
}

/** 创建由宿主提问通道支撑的标准澄清工具。 */
export function createAskUserTool(host: AskUserHost): RuntimeToolDefinition {
  return {
    ...ASK_USER_TOOL_METADATA,
    parameters: AskUserParameters,
    safety: 'read-only',
    reversible: false,
    executionMode: 'sequential',
    // 答复耗时由人决定：驱动器在本工具执行期间停掉无活动 deadline。
    waitsForUserInput: true,
    summarizeInput: (input) => (input as AskUserInput).question,
    async execute(input, context) {
      context.signal.throwIfAborted()
      const request = input as AskUserInput
      const answer = await host.request(
        {
          prompt: request.question,
          options: request.options,
          multiSelect: request.multiSelect ?? false,
        },
        { runId: context.runId, toolCallId: context.toolCallId, signal: context.signal },
      )
      context.signal.throwIfAborted()
      return {
        content: JSON.stringify({
          status: 'answered',
          selected: answer.selectedLabels,
          ...(answer.note ? { note: answer.note } : {}),
        }),
        summary: answer.selectedLabels.length
          ? `User selected: ${answer.selectedLabels.join(', ')}.`
          : 'User answered with free text.',
      }
    },
  }
}
