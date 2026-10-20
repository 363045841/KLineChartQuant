/** 独立编辑器与宿主会话的消息契约；只传递可结构化克隆的草稿与状态。 */

import type { LogEvent } from '@363045841yyt/klinechart-plot-contracts'
import type { ScriptIdentity } from './types.js'

export const SCRIPT_EDITOR_WINDOW_CHANNEL = 'klinechart-script-editor'

/** 新窗口本地草稿序号用于防止迟到的宿主快照覆盖连续输入。 */
export interface DetachedEditorDraft {
  source: string
  trusted: boolean
  editVersion: number
}

/** 宿主负责身份和持久化，新窗口负责实时编辑及语言服务。 */
export interface DetachedEditorSnapshot extends DetachedEditorDraft {
  logs: readonly LogEvent[]
  title: string
  identity: ScriptIdentity
  saving: boolean
  saved: boolean
  error: string | null
}

export type DetachedEditorCommand = DetachedEditorDraft & {
  type: 'draft' | 'save' | 'create-copy' | 'return'
}

export type DetachedEditorEvent =
  | DetachedEditorCommand
  | { type: 'ready' }
  | { type: 'clear-output' }

export interface DetachedEditorConnection {
  channel: typeof SCRIPT_EDITOR_WINDOW_CHANNEL
}
