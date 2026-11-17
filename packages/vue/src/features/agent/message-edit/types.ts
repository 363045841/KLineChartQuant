// 用户消息编辑的交互契约：异步提交成功后由 Bridge 在官方边界重建分支。
import type { EntryId } from '../agent-contracts.js'

export type EditMessageAction = (entryId: EntryId, prompt: string) => Promise<void>

/** 可编辑的用户条目。 */
export interface MessageEditTarget {
  readonly entryId: EntryId
  readonly content: string
}

export interface MessageEditOptions {
  target: () => MessageEditTarget
  disabled: () => boolean
  action: () => EditMessageAction | undefined
  failureText: () => string
}
