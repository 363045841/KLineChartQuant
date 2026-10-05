// 用户消息编辑的交互契约，异步提交由工作区交给 Bridge。
import type { AgentMessageView } from '../agent-contracts.js'

export type EditMessageAction = (runId: string, prompt: string) => Promise<void>

export interface MessageEditOptions {
  message: () => AgentMessageView
  disabled: () => boolean
  action: () => EditMessageAction | undefined
  failureText: () => string
}
