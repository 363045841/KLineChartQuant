/** 独立编辑器与宿主会话的消息契约；只传递可结构化克隆的草稿与状态。 */

import type { LogEvent } from '@363045841yyt/klinechart-plot-contracts'
import type { ScriptEditorDocument, ScriptEditorTab, ScriptIdentity } from './types.js'

export const SCRIPT_EDITOR_WINDOW_CHANNEL = 'klinechart-script-editor'

/** 新窗口本地草稿序号用于防止迟到的宿主快照覆盖连续输入。 */
export interface DetachedEditorDraft {
  activeTabId: string | null
  source: string
  trusted: boolean
  editVersion: number
}

/** 宿主负责身份和持久化，新窗口负责实时编辑及语言服务。 */
export interface DetachedEditorSnapshot extends DetachedEditorDraft {
  tabs: readonly ScriptEditorTab[]
  kind?: 'indicator' | 'library'
  documents?: readonly ScriptEditorDocument[]
  libraries?: readonly { name: string; source: string }[]
  logs: readonly LogEvent[]
  title: string
  identity: ScriptIdentity
  saving: boolean
  saved: boolean
  error: string | null
  /** 宿主图表的有效主题，跨窗口后仍需与标签页保持一致。 */
  theme: 'light' | 'dark'
}

export type DetachedEditorNavigation =
  | { type: 'select-tab' | 'close-tab' | 'open-script'; id: string }
  | { type: 'create-script'; kind: 'indicator' | 'library' }

export type DetachedEditorCommand = DetachedEditorDraft & (
  | { type: 'draft' | 'save' | 'create-copy' | 'return' }
  | DetachedEditorNavigation
)

/** 导航命令同时携带草稿，宿主先提交当前标签再执行切换。 */
export type DetachedEditorNavigationCommand = DetachedEditorCommand & DetachedEditorNavigation

export type DetachedEditorEvent =
  | DetachedEditorCommand
  | { type: 'ready' }
  | { type: 'clear-output' }
  | { type: 'refresh-documents' }

export interface DetachedEditorConnection {
  channel: typeof SCRIPT_EDITOR_WINDOW_CHANNEL
}
