/** 验证文件树右键菜单按行生成条目、分隔线与禁用原因。 */

import { afterEach, describe, expect, it } from 'vitest'
import { effectScope, ref } from 'vue'
import { useScriptTreeMenu } from '../impl/useScriptTreeMenu.js'
import type { ScriptTreeRow } from '../types.js'

/** 被右键的文件行；菜单项只依赖身份和只读状态。 */
const ROW: ScriptTreeRow = {
  type: 'file',
  key: 'file:tree-entry',
  kind: 'indicator',
  target: { kind: 'document', documentId: 'tree-entry' },
  name: '树节点',
  folder: '',
  depth: 1,
  tabId: null,
  readonly: false,
  dirty: false,
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('文件树菜单', () => {
  it('右键后生成文件菜单条目、分隔线与菜单标签', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const scope = effectScope()
    const session = scope.run(() =>
      useScriptTreeMenu({ apply: () => {}, writable: () => true, treeHost: ref(host) }),
    )!
    try {
      session.openContextMenu(
        new MouseEvent('contextmenu', { clientX: 5, clientY: 5, bubbles: true, cancelable: true }),
        ROW,
      )
      const state = session.menu.state.value
      expect(state?.role).toBe('menu')
      expect(state?.label).toBe('脚本文件菜单')
      const items = state?.content.kind === 'menu' ? state.content.items : []
      expect(items.map((item) => item.label)).toEqual([
        '新建文件',
        '新建文件夹',
        '复制文件',
        '删除文件',
      ])
      // 复制/删除与新建操作之间用分隔线隔开。
      expect(items[2]?.separatorBefore).toBe(true)
      expect(items.every((item) => !item.disabled)).toBe(true)
    } finally {
      scope.stop()
    }
  })
})
