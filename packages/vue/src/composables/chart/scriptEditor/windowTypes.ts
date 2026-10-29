/** 独立编辑器与宿主会话的消息契约；只传递可结构化克隆的草稿与状态。 */

import type { LogEvent } from '@363045841yyt/klinechart-plot-contracts'
import type {
  ScriptEditorDocument,
  ScriptEditorFolder,
  ScriptEditorTab,
  ScriptIdentity,
  ScriptTreeAction,
} from './types.js'

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
  folders?: readonly ScriptEditorFolder[]
  libraries?: readonly { name: string; source: string }[]
  logs: readonly LogEvent[]
  title: string
  identity: ScriptIdentity
  saving: boolean
  executing?: 'run' | 'add-to-chart' | null
  saved: boolean
  /** 当前标签保存/复制失败。 */
  error: string | null
  /** 当前标签调试或添加失败；面板据此切换到问题页。 */
  executionError: string | null
  /** 文件树操作失败；只展示在目录区域。 */
  treeError: string | null
  /** 宿主图表的有效主题，跨窗口后仍需与标签页保持一致。 */
  theme: 'light' | 'dark'
}

export type DetachedEditorNavigation =
  | { type: 'move-tab'; id: string; targetId: string }
  | { type: 'tree-action'; action: ScriptTreeAction }
  | { type: 'select-tab' | 'close-tab' | 'open-script'; id: string }

export type DetachedEditorCommand = DetachedEditorDraft &
  (
    | { type: 'draft' | 'save' | 'run' | 'add-to-chart' | 'create-copy' | 'return' }
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
