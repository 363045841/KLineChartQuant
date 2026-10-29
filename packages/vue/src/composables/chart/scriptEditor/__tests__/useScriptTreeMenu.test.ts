/** 验证文件树右键菜单复用共用菜单的焦点契约：打开后可键盘导航与关闭。 */

import { afterEach, describe, expect, it } from 'vitest'
import { effectScope, ref } from 'vue'
import { useScriptTreeMenu } from '../impl/useScriptTreeMenu.js'
import type { ScriptTreeRow } from '../types.js'
import { press } from './helpers/menuEvents.js'

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
  it('右键后焦点进入菜单，Escape 关闭并把焦点还给触发元素', () => {
    const host = document.createElement('div')
    const trigger = document.createElement('button')
    host.append(trigger)
    document.body.append(host)
    trigger.focus()
    const treeHost = ref<HTMLElement | null>(host)
    const scope = effectScope()
    const session = scope.run(() =>
      useScriptTreeMenu({ apply: () => {}, writable: () => true, treeHost }),
    )!
    try {
      session.openContextMenu(
        new MouseEvent('contextmenu', { clientX: 5, clientY: 5, bubbles: true, cancelable: true }),
        ROW,
      )
      const first = host.querySelector<HTMLButtonElement>('.klc-script-menu button:not(:disabled)')
      expect(first).not.toBeNull()
      expect(document.activeElement).toBe(first)

      press(first!, 'Escape')

      expect(host.querySelector('.klc-script-menu')?.childElementCount).toBe(0)
      expect(document.activeElement).toBe(trigger)
    } finally {
      scope.stop()
    }
  })
})
