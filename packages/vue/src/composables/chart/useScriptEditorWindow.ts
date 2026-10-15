/**
 * 脚本编辑器的独立窗口会话。
 *
 * 窗口是 DOM 副作用，编辑状态仍由 useScriptEditor 的会话持有：
 * 本组合式只负责开关窗口、提供 Teleport 挂载点，并在窗口关闭时把编辑器交回标签页弹窗。
 */
import { onBeforeUnmount, type Ref, ref, watch } from 'vue'
import {
  type DetachedWindow,
  openDetachedWindow,
  supportsDetachedWindow,
} from './scriptEditor/impl/detachedWindow.js'
import type { ScriptEditorSession } from './useScriptEditor.js'

/** 独立窗口会话的状态与操作。 */
export interface ScriptEditorWindowSession {
  /** 当前环境是否支持文档画中画窗口。 */
  readonly supported: boolean
  /** 编辑器在新窗口中的挂载点；null 表示未在新窗口打开。 */
  readonly container: Ref<HTMLElement | null>
  /** 在新窗口打开编辑器，并关闭页面内的弹窗。 */
  open(title: string): Promise<void>
  /** 关闭新窗口并把编辑器交回标签页弹窗。 */
  returnToDialog(): void
}

/**
 * 创建独立窗口会话；每个图表实例独立。
 *
 * @param session 编辑会话，独立窗口只读取它的草稿并写回保存结果
 * @param styleHost 图表宿主元素：独立窗口从它所在的根节点复制样式（Web Component 下是 shadow root）
 */
export function useScriptEditorWindow(
  session: ScriptEditorSession,
  styleHost: Readonly<Ref<HTMLElement | null>>,
): ScriptEditorWindowSession {
  const supported = supportsDetachedWindow()
  const container = ref<HTMLElement | null>(null)
  let detached: DetachedWindow | null = null

  /** 释放新窗口与样式镜像；不改动编辑会话状态。 */
  function disposeWindow(): void {
    if (!detached) return
    detached.window.removeEventListener('pagehide', returnToDialog)
    detached.dispose()
    detached = null
    container.value = null
  }

  /**
   * 关闭新窗口并把编辑器交回标签页弹窗；用户关闭窗口、浏览器的「返回标签页」与窗口内按钮共用此路径。
   *
   * 只切换展示位置，不重新加载源码，未保存的草稿与保存用的 revision 都保留。
   */
  function returnToDialog(): void {
    if (!detached) return
    disposeWindow()
    session.open.value = true
  }

  async function open(title: string): Promise<void> {
    if (detached) {
      detached.window.focus()
      return
    }
    const next = await openDetachedWindow(title, styleHost.value)
    detached = next
    next.window.addEventListener('pagehide', returnToDialog)
    container.value = next.container
    // 编辑器已在独立窗口，关闭页面内的弹窗，避免同一草稿出现两个编辑器。
    session.open.value = false
  }

  // 独立窗口打开期间用户又从图例打开弹窗时，关闭独立窗口，让弹窗成为唯一编辑器。
  watch(session.open, (isOpen) => {
    if (isOpen) disposeWindow()
  })

  onBeforeUnmount(disposeWindow)

  return { supported, container, open, returnToDialog }
}
