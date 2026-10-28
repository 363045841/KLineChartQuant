/**
 * 脚本编辑器的独立窗口会话。
 *
 * 窗口是 DOM 副作用，编辑状态仍由 useScriptEditor 的会话持有：
 * 本组合式通过专用消息通道同步草稿和保存结果，编辑器运行时归新窗口所有。
 */
import { onBeforeUnmount, type Ref, watch } from 'vue'
import {
  type DetachedWindow,
  openDetachedWindow,
  supportsDetachedWindow,
} from './scriptEditor/impl/detachedWindow.js'
import type {
  DetachedEditorCommand,
  DetachedEditorEvent,
  DetachedEditorNavigationCommand,
  DetachedEditorSnapshot,
} from './scriptEditor/windowTypes.js'
import type { ScriptEditorSession } from './useScriptEditor.js'

/** 独立窗口会话的状态与操作。 */
export interface ScriptEditorWindowSession {
  /** 当前环境是否支持打开浏览器窗口。 */
  readonly supported: boolean
  /** 在新窗口打开编辑器，并关闭页面内的弹窗。 */
  open(title: string): Promise<void>
  /** 关闭新窗口并把编辑器交回标签页弹窗。 */
  returnToDialog(): void
}

/**
 * 创建独立窗口会话；每个图表实例独立。
 *
 * @param session 编辑会话，独立窗口只读取它的草稿并写回保存结果
 * @param styleHost 图表宿主元素：独立页面从宿主同步主题变量和外部样式
 * @param theme 图表当前有效主题，独立窗口的语法高亮与标签页保持一致
 */
export function useScriptEditorWindow(
  session: ScriptEditorSession,
  styleHost: Readonly<Ref<HTMLElement | null>>,
  theme: Readonly<Ref<'light' | 'dark'>>,
): ScriptEditorWindowSession {
  const supported = supportsDetachedWindow()
  let detached: DetachedWindow | null = null
  let editVersion = 0
  let title = ''

  /** 快照只包含跨窗口可克隆的数据，不共享 Vue 引用或语言服务实例。 */
  function snapshot(): DetachedEditorSnapshot {
    return {
      tabs: session.tabs.value,
      activeTabId: session.activeTabId.value,
      kind: session.kind.value,
      documents: session.documents.value,
      folders: session.folders.value,
      libraries: session.libraries.value,
      title: session.name.value ? `编辑脚本 · ${session.name.value}` : title,
      source: session.source.value,
      trusted: session.trusted.value,
      editVersion,
      identity: session.identity.value,
      saving: session.saving.value,
      executing: session.executing.value,
      saved: session.saved.value,
      error: session.error.value,
      logs: session.logs.value,
      theme: theme.value,
    }
  }

  /** 把当前标签的草稿写回会话；迟到文本或切换到其他标签时返回 false。 */
  function applyDraft(window: DetachedWindow, message: DetachedEditorCommand): boolean {
    if (message.editVersion < editVersion) return false
    editVersion = message.editVersion
    if (message.activeTabId !== session.activeTabId.value) {
      window.update(snapshot())
      return false
    }
    session.source.value = message.source
    session.trusted.value = message.trusted
    return true
  }

  /** 判断消息是否只是标签导航，命令类继续走保存/复制/返回。 */
  function isNavigation(
    message: DetachedEditorCommand,
  ): message is DetachedEditorNavigationCommand {
    return (
      message.type === 'select-tab' ||
      message.type === 'close-tab' ||
      message.type === 'move-tab' ||
      message.type === 'open-script' ||
      message.type === 'tree-action'
    )
  }

  /** 在独立窗口内切换标签；结果同步回宿主，避免两处会话分叉。 */
  function navigate(message: DetachedEditorNavigationCommand): void {
    if (message.type === 'select-tab') session.selectTab(message.id)
    else if (message.type === 'close-tab') session.closeTab(message.id)
    else if (message.type === 'move-tab') session.moveTab(message.id, message.targetId)
    else if (message.type === 'tree-action') void session.applyTreeAction(message.action)
    else session.openFor(message.id)
  }

  /** 按端口消息顺序接收草稿，保存与返回始终使用命令携带的最新文本。 */
  function onMessage(message: DetachedEditorEvent): void {
    const window = detached
    if (message.type === 'ready' || !window) return
    if (message.type === 'refresh-documents') {
      session.refreshDocuments()
      return
    }
    if (message.type === 'clear-output') {
      session.clearOutput()
      return
    }
    if (!applyDraft(window, message)) return
    if (isNavigation(message)) {
      navigate(message)
      session.open.value = false
      window.update(snapshot())
      return
    }
    if (message.type === 'save') void session.save()
    else if (message.type === 'run') void session.run()
    else if (message.type === 'add-to-chart') void session.addToChart()
    else if (message.type === 'create-copy') void session.createCopy()
    else if (message.type === 'return') returnToDialog()
  }

  /** 释放新窗口与样式镜像；不改动编辑会话状态。 */
  function disposeWindow(): void {
    if (!detached) return
    detached.dispose()
    detached = null
  }

  /**
   * 关闭新窗口并把编辑器交回标签页弹窗；用户关闭窗口与窗口内按钮共用此路径。
   *
   * 只切换展示位置，不重新加载源码，未保存的草稿与保存用的 revision 都保留。
   */
  function returnToDialog(): void {
    if (!detached) return
    disposeWindow()
    session.open.value = true
  }

  /** 同步创建浏览器窗口，待独立页面接通后再交接草稿并关闭弹窗。 */
  async function open(windowTitle: string): Promise<void> {
    if (detached) {
      detached.window.focus()
      return
    }
    title = windowTitle
    editVersion = 0
    const next = openDetachedWindow(title, styleHost.value, onMessage)
    detached = next
    try {
      await next.ready
    } catch (error) {
      if (detached === next) disposeWindow()
      throw error
    }
    if (detached !== next) return
    next.update(snapshot())
    // 编辑器已在独立窗口，关闭页面内的弹窗，避免同一草稿出现两个编辑器。
    session.open.value = false
  }

  // 独立窗口打开期间用户又从图例打开弹窗时，关闭独立窗口，让弹窗成为唯一编辑器。
  watch(session.open, (isOpen) => {
    if (isOpen) disposeWindow()
  })

  // 本地编辑不会等待这里的确认；序号阻止较早的确认覆盖新窗口随后输入的草稿。
  watch(
    [
      session.source,
      session.trusted,
      session.identity,
      session.saving,
      session.executing,
      session.saved,
      session.error,
      session.name,
      session.logs,
      session.kind,
      session.documents,
      session.folders,
      session.libraries,
      session.tabs,
      session.activeTabId,
      theme,
    ],
    () => detached?.update(snapshot()),
    { flush: 'post' },
  )

  onBeforeUnmount(disposeWindow)

  return { supported, open, returnToDialog }
}
