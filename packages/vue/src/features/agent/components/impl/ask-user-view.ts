// 提问卡片的数据重建：提问来自调用参数，答复来自工具结果，二者都是官方持久化条目。
import type {
  QuestionAnswerView,
  QuestionOptionView,
  QuestionView,
  ToolCall,
  ToolResultMessage,
} from '../../agent-contracts.js'
import { readResultText } from './tool-view.js'

/** 重建提问所需的三份官方事实。 */
interface AskUserQuestionInput {
  readonly call: ToolCall
  /** 工具声明的呈现方式；来自运行中槽位或已提交结果的 details。 */
  readonly presentation?: 'question'
  /** 宿主当前挂起的提问；同一次调用最多一条。 */
  readonly stored?: QuestionView
  readonly result?: ToolResultMessage
}

/** 判断 JSON 对象。 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 从调用参数还原提问本身。
 * @param args 模型提交的工具参数。
 * @returns 提问内容、选项与多选标记；参数不足以构成提问时返回 null。
 */
function readInvocation(
  args: Record<string, unknown>,
): Pick<QuestionView, 'prompt' | 'options' | 'multiSelect'> | null {
  const prompt = typeof args.question === 'string' ? args.question.trim() : ''
  if (!prompt || !Array.isArray(args.options) || args.options.length === 0) return null
  const options: QuestionOptionView[] = []
  for (const raw of args.options) {
    if (!isObject(raw)) return null
    const value = typeof raw.value === 'string' ? raw.value : ''
    const label = typeof raw.label === 'string' ? raw.label : ''
    if (!value || !label) return null
    options.push({
      value,
      label,
      ...(typeof raw.description === 'string' && raw.description
        ? { description: raw.description }
        : {}),
    })
  }
  return { prompt, options, multiSelect: args.multiSelect === true }
}

/**
 * 从工具结果读取答复。
 *
 * 工具只产出两种结果：`answered` 与 `cancelled`；中止或异常同样视为没有作答。
 * @param result 已提交的工具结果。
 * @returns 答复或取消。
 */
function readOutcome(
  result: ToolResultMessage | undefined,
): { readonly status: 'answered'; readonly answer: QuestionAnswerView } | { readonly status: 'cancelled' } {
  if (!result) return { status: 'cancelled' }
  let payload: unknown
  try {
    payload = JSON.parse(readResultText(result.content))
  } catch {
    return { status: 'cancelled' }
  }
  if (!isObject(payload) || payload.status !== 'answered' || !Array.isArray(payload.selected)) {
    return { status: 'cancelled' }
  }
  const selectedValues = payload.selected.filter(
    (value): value is string => typeof value === 'string',
  )
  return {
    status: 'answered',
    answer: {
      selectedValues,
      ...(typeof payload.note === 'string' && payload.note ? { note: payload.note } : {}),
    },
  }
}

/**
 * 判断一次调用是不是提问，并还原成可渲染的提问视图。
 *
 * 判定只看宿主事实：挂起提问按工具调用身份匹配，已结算的靠工具声明的
 * `presentation`；不看工具名。
 * @param input 调用、声明的呈现方式、挂起提问与工具结果。
 * @returns 待答或已结算的提问视图；这次调用不是提问时为 null。
 */
export function readAskUserQuestion(input: AskUserQuestionInput): QuestionView | null {
  if (!input.stored && input.presentation !== 'question') return null
  if (input.stored) return input.stored
  const invocation = readInvocation(input.call.arguments)
  if (!invocation) return null
  const outcome = readOutcome(input.result)
  return {
    id: `ask:${input.call.id}`,
    toolCallId: input.call.id,
    ...invocation,
    status: outcome.status,
    ...(outcome.status === 'answered' ? { answer: outcome.answer } : {}),
  }
}
