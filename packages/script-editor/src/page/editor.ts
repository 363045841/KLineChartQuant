/** 独立编辑器窗口：在当前 Window 内构建 Vue、CodeMirror 与语言 Worker。 */
import type { ScriptTreeAction } from '@vue-src/composables/chart/scriptEditor/types.js'
import {
  type DetachedEditorConnection,
  type DetachedEditorEvent,
  type DetachedEditorSnapshot,
  SCRIPT_EDITOR_WINDOW_CHANNEL,
} from '@vue-src/composables/chart/scriptEditor/windowTypes.js'
import { createDetachedEditorState } from '@vue-src/composables/chart/scriptEditor/impl/detachedEditorState.js'
import ScriptEditorHost from '@vue-src/components/script/ScriptEditorHost.vue'
import '@fontsource/jetbrains-mono/400.css'
import '@vue-src/styles/scrollbar.css'
import { createApp, defineComponent, h } from 'vue'

/** 只接受能打开本窗口的父页面通过专属通道发来的草稿，不通过全局 message 广播。 */
function connect(event: MessageEvent<DetachedEditorConnection>): void {
  if (event.source !== window.opener || event.origin !== window.location.origin) return
  if (event.data?.channel !== SCRIPT_EDITOR_WINDOW_CHANNEL || !event.ports[0]) return
  window.removeEventListener('message', connect)
  const port = event.ports[0]
  let editor: ReturnType<typeof createDetachedEditorState> | undefined
  let app: ReturnType<typeof createApp> | undefined

  /** 把草稿以外的消息端口按顺序投递，避免竞态等待。 */
  function send(message: DetachedEditorEvent): void {
    port.postMessage(message)
  }

  port.onmessage = (message: MessageEvent<DetachedEditorSnapshot>) => {
    document.title = message.data.title
    if (editor) {
      editor.apply(message.data)
      return
    }
    const state = createDetachedEditorState(message.data, send)
    editor = state
    app = createApp(
      defineComponent({
        setup() {
          return () =>
            h(ScriptEditorHost, {
              mode: 'window',
              ...state.snapshot.value,
              container: document.body,
              'onUpdate:source': state.updateSource,
              'onUpdate:trusted': state.updateTrusted,
              onSave: () => state.command('save'),
              onRun: () => state.command('run'),
              onAddToChart: () => state.command('add-to-chart'),
              onClearOutput: () => send({ type: 'clear-output' }),
              onCreateCopy: () => state.command('create-copy'),
              onTreeAction: (action: ScriptTreeAction) =>
                state.navigate({ type: 'tree-action', action }),
              onOpenScript: (id: string) => state.navigate({ type: 'open-script', id }),
              onSelectTab: (id: string) => state.navigate({ type: 'select-tab', id }),
              onCloseTab: (id: string) => state.navigate({ type: 'close-tab', id }),
              onMoveTab: (id: string, targetId: string) =>
                state.navigate({ type: 'move-tab', id, targetId }),
              onRefreshDocuments: () => send({ type: 'refresh-documents' }),
              onReturn: () => state.command('return'),
            })
        },
      }),
    )
    const root = document.createElement('div')
    document.body.append(root)
    app.mount(root)
  }
  window.addEventListener(
    'pagehide',
    () => {
      editor?.command('return')
      app?.unmount()
      port.close()
    },
    { once: true },
  )
  send({ type: 'ready' })
}

window.addEventListener('message', connect)
window.opener?.postMessage({ channel: SCRIPT_EDITOR_WINDOW_CHANNEL }, window.location.origin)
