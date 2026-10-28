/** 工作区交互的装配入口，各模型独立维护自身状态。 */
import type { Ref } from 'vue'
import type {
  ScriptEditorDocument,
  ScriptEditorFolder,
  ScriptEditorTab,
  ScriptTreeAction,
} from '../types.js'
import { useScriptTabs } from './useScriptTabs.js'
import { useScriptTree } from './useScriptTree.js'
import { useScriptTreeMenu } from './useScriptTreeMenu.js'

interface NavigationActions {
  documents(): readonly ScriptEditorDocument[]
  folders(): readonly ScriptEditorFolder[]
  tabs(): readonly ScriptEditorTab[]
  activeTabId(): string | null
  select(id: string): void
  close(id: string): void
  move(id: string, targetId: string): void
  openFile(id: string): void
  apply(action: ScriptTreeAction): void
  writable(): boolean
  readonly tabsHost: Readonly<Ref<HTMLElement | null>>
  readonly treeHost: Readonly<Ref<HTMLElement | null>>
}

export function useScriptEditorNavigation(actions: NavigationActions) {
  return { ...useScriptTree(actions), ...useScriptTabs(actions), ...useScriptTreeMenu(actions) }
}
