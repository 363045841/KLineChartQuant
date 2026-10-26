/** 独立窗口入口：在当前 Window 内挂载 Vue、CodeMirror 和语言 Worker。 */
import { createApp, defineComponent, h } from 'vue'
import '@fontsource/jetbrains-mono/400.css'
import '@vue-src/styles/scrollbar.css'
import ScriptEditorHost from '@vue-src/components/script/ScriptEditorHost.vue'
import {
  type DetachedEditorConnection,
  type DetachedEditorEvent,
  type DetachedEditorSnapshot,
  SCRIPT_EDITOR_WINDOW_CHANNEL,
} from '../windowTypes.js'
import { createDetachedEditorState } from './detachedEditorState.js'

/** 仅接受打开本窗口的宿主传入的专用通道，后续草稿不通过全局 message 广播。 */
function connect(event: MessageEvent<DetachedEditorConnection>): void {
  if (event.source !== window.opener || event.origin !== window.location.origin) return
  if (event.data?.channel !== SCRIPT_EDITOR_WINDOW_CHANNEL || !event.ports[0]) return
  window.removeEventListener('message', connect)
  const port = event.ports[0]
  let editor: ReturnType<typeof createDetachedEditorState> | undefined
  let app: ReturnType<typeof createApp> | undefined

  /** 草稿由消息端口按顺序发送，输入和补全不等待宿主返回。 */
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
              onClearOutput: () => send({ type: 'clear-output' }),
              onCreateCopy: () => state.command('create-copy'),
              onCreateScript: (kind: 'indicator' | 'library') => state.navigate({ type: 'create-script', kind }),
              onOpenScript: (id: string) => state.navigate({ type: 'open-script', id }),
              onSelectTab: (id: string) => state.navigate({ type: 'select-tab', id }),
              onCloseTab: (id: string) => state.navigate({ type: 'close-tab', id }),
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
