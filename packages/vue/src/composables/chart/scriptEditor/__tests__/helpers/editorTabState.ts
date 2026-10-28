/** 工作区与跨窗口测试共用的单文件标签契约。 */
import type { ScriptEditorTab } from '../../types.js'

/** 每次创建独立的标签摘要，测试只声明与当前场景有关的差异。 */
export function createEditorTabState() {
  const tabs: readonly ScriptEditorTab[] = [
    {
      id: 'test-tab',
      definitionId: 'test-file',
      title: '测试指标',
      kind: 'indicator',
      dirty: false,
      folder: '',
    },
  ]
  return { tabs, activeTabId: 'test-tab' }
}
