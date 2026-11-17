// 从官方会话文档读取运行状态与实时工具；UI 只做展示映射，不保存第二份状态。
import { LiveDoc } from '@earendil-works/pi-durable'
import type {
  AgentErrorView,
  JsonObject,
  JsonValue,
  TextContent,
  ThinkingContent,
  ToolCall,
} from '../../agent-contracts.js'

/** 当前流式回答的可见块，仅保留 UI 能渲染的类型。 */
export type LiveAnswerBlock = TextContent | ThinkingContent | ToolCall

/** 当前流式回答。 */
export interface LiveAnswerView {
  readonly blocks: readonly LiveAnswerBlock[]
}

/** 当前工具轮中的一个工具槽。 */
export interface LiveToolView {
  readonly callId: string
  readonly name: string
  readonly status: 'pending' | 'running' | 'done'
  readonly output?: string
  readonly details?: JsonValue
}

/** 判断 JSON 对象。 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 判断字符串。 */
function isString(value: unknown): value is string {
  return typeof value === 'string'
}

/** 读取 `pi.live` 文档。 */
function liveDoc(docs: Readonly<Record<string, JsonObject>>): Record<string, unknown> | undefined {
  const value = docs[LiveDoc.definition.kind]
  return isObject(value) ? value : undefined
}

/** 当前会话是否有运行中的任务。 */
export function isRunActive(docs: Readonly<Record<string, JsonObject>>): boolean {
  const live = liveDoc(docs)
  return live !== undefined && isObject(live.run)
}

/** 当前流式回答的块；没有进行中的生成时返回 undefined。 */
export function readLiveAnswer(
  docs: Readonly<Record<string, JsonObject>>,
): LiveAnswerView | undefined {
  const live = liveDoc(docs)
  if (!live || !isObject(live.generation)) return undefined
  const message = live.generation.message
  if (!isObject(message) || !Array.isArray(message.content)) return undefined
  const blocks: LiveAnswerBlock[] = []
  for (const block of message.content) {
    if (!isObject(block) || !isString(block.type)) continue
    if (block.type === 'text' && isString(block.text)) {
      blocks.push({ type: 'text', text: block.text })
    } else if (block.type === 'thinking' && isString(block.thinking)) {
      blocks.push({ type: 'thinking', thinking: block.thinking })
    } else if (block.type === 'toolCall' && isString(block.id) && isString(block.name)) {
      blocks.push({
        type: 'toolCall',
        id: block.id,
        name: block.name,
        // 官方文档值已是 JSON，这里只做类型收窄。
        arguments: isObject(block.arguments) ? (block.arguments as JsonObject) : {},
      })
    }
  }
  return blocks.length > 0 ? { blocks } : undefined
}

/** 当前工具轮的工具槽，按 callId 索引。 */
export function readLiveTools(
  docs: Readonly<Record<string, JsonObject>>,
): ReadonlyMap<string, LiveToolView> {
  const live = liveDoc(docs)
  const slots = new Map<string, LiveToolView>()
  if (!live || !Array.isArray(live.tools)) return slots
  for (const slot of live.tools) {
    if (!isObject(slot) || !isString(slot.callId) || !isString(slot.name)) continue
    const status = slot.status
    if (status !== 'pending' && status !== 'running' && status !== 'done') continue
    slots.set(slot.callId, {
      callId: slot.callId,
      name: slot.name,
      status,
      ...(isString(slot.output) ? { output: slot.output } : {}),
      ...('details' in slot ? { details: slot.details as JsonValue } : {}),
    })
  }
  return slots
}

/** 最近一次运行失败的展示视图；成功或进行中时返回 undefined。 */
export function readRunFailure(
  docs: Readonly<Record<string, JsonObject>>,
): AgentErrorView | undefined {
  const live = liveDoc(docs)
  if (!live || !isObject(live.runFailure)) return undefined
  const failure = live.runFailure
  if (!isString(failure.reason)) return undefined
  return {
    code: failure.reason.toUpperCase(),
    message: isString(failure.detail) ? failure.detail : failure.reason,
    retryable: true,
  }
}
