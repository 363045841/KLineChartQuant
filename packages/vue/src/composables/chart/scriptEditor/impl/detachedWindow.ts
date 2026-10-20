/**
 * 承载脚本编辑器的普通浏览器独立窗口。
 *
 * 新窗口执行独立页面，宿主仅管理消息通道、窗口生命周期和主题镜像。
 */
import editorPage from 'virtual:klinechart-script-editor-page'
import {
  type DetachedEditorConnection,
  type DetachedEditorEvent,
  type DetachedEditorSnapshot,
  SCRIPT_EDITOR_WINDOW_CHANNEL,
} from '../windowTypes.js'

/** 独立编辑器窗口的初始尺寸（px）。 */
const DETACHED_WINDOW_SIZE = { width: 760, height: 560 } as const
const WINDOW_START_TIMEOUT = 15000

/** 当前环境是否支持打开浏览器窗口。 */
export function supportsDetachedWindow(): boolean {
  return typeof window !== 'undefined' && typeof window.open === 'function'
}

/** 独立窗口句柄：窗口本体、消息通道与清理函数。 */
export interface DetachedWindow {
  /** 窗口本体，用于聚焦与监听关闭。 */
  readonly window: Window
  /** 新页面已接通消息通道。 */
  readonly ready: Promise<void>
  /** 向新窗口同步宿主持有的身份与保存结果。 */
  update(snapshot: DetachedEditorSnapshot): void
  /** 关闭窗口并停止样式镜像。 */
  dispose(): void
}

/**
 * 打开承载脚本编辑器的独立窗口。
 * @param title 写入新窗口的 document.title，避免标题栏显示为空。
 * @param styleHost 编辑器所在的宿主元素：普通应用在 document 里，Web Component 在 shadow root 里。
 */
export function openDetachedWindow(
  title: string,
  styleHost: HTMLElement | null,
  onMessage: (message: DetachedEditorEvent) => void,
): DetachedWindow {
  // 在点击事件内同步打开，保留浏览器要求的用户激活状态。
  const popup = window.open(
    '',
    '_blank',
    `popup=yes,width=${DETACHED_WINDOW_SIZE.width},height=${DETACHED_WINDOW_SIZE.height},resizable=yes,scrollbars=yes`,
  )
  if (!popup) throw new Error('无法打开编辑器窗口，请允许浏览器弹出窗口后重试')
  const editorWindow = popup
  editorWindow.document.title = title
  const channel = new MessageChannel()
  let stopMirroring: (() => void) | undefined
  let disposed = false
  let connected = false
  let resolveReady: () => void = () => {}
  let rejectReady: (error: Error) => void = () => {}
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })
  const timeout = window.setTimeout(
    () => fail(new Error('独立编辑器启动超时')),
    WINDOW_START_TIMEOUT,
  )

  /** 引导消息只接受本窗口和同源宿主，专用端口随后接管全部通信。 */
  function connect(event: MessageEvent<DetachedEditorConnection>): void {
    if (event.source !== editorWindow || event.origin !== window.location.origin) return
    if (event.data?.channel !== SCRIPT_EDITOR_WINDOW_CHANNEL || disposed || connected) return
    connected = true
    window.removeEventListener('message', connect)
    editorWindow.postMessage({ channel: SCRIPT_EDITOR_WINDOW_CHANNEL }, window.location.origin, [
      channel.port2,
    ])
  }

  /** 初始化失败关闭空窗口，调用方保留原弹窗并展示错误。 */
  function fail(error: Error): void {
    rejectReady(error)
    dispose()
  }

  /** 初始化期间关闭窗口时结束等待；运行后的关闭由页面发送最后一份草稿。 */
  function onPageHide(): void {
    if (!connected) fail(new Error('独立编辑器窗口已关闭'))
  }

  /** 页面入口执行错误通过打开操作反馈给宿主。 */
  function onError(event: ErrorEvent): void {
    fail(new Error(event.message || '独立编辑器启动失败'))
  }

  channel.port1.onmessage = (event: MessageEvent<DetachedEditorEvent>) => {
    if (disposed) return
    if (event.data.type === 'ready') {
      window.clearTimeout(timeout)
      editorWindow.removeEventListener('error', onError)
      resolveReady()
    } else {
      onMessage(event.data)
    }
  }
  window.addEventListener('message', connect)
  editorWindow.addEventListener('pagehide', onPageHide)
  editorWindow.addEventListener('error', onError)

  /** 主页面退出或组件卸载时，同时释放窗口与样式镜像。 */
  function dispose(): void {
    if (disposed) return
    disposed = true
    window.clearTimeout(timeout)
    window.removeEventListener('message', connect)
    window.removeEventListener('pagehide', dispose)
    editorWindow.removeEventListener('pagehide', onPageHide)
    editorWindow.removeEventListener('error', onError)
    rejectReady(new Error('独立编辑器窗口已关闭'))
    channel.port1.close()
    channel.port2.close()
    stopMirroring?.()
    editorWindow.close()
  }
  window.addEventListener('pagehide', dispose)
  // 先启动基础编辑器；语言服务仍在 useCodeMirror 中异步加载，不阻塞首屏。
  editorWindow.document.open()
  editorWindow.document.write(
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>',
  )
  editorWindow.document.close()
  const base = editorWindow.document.createElement('base')
  base.href = document.baseURI
  editorWindow.document.head.prepend(base)
  for (const href of editorPage.styles) {
    const link = editorWindow.document.createElement('link')
    link.rel = 'stylesheet'
    link.href = new URL(href, document.baseURI).href
    editorWindow.document.head.append(link)
  }
  stopMirroring = mirrorDocumentShell(document, editorWindow.document, styleHost)
  const script = editorWindow.document.createElement('script')
  script.type = 'module'
  script.src = new URL(editorPage.script, document.baseURI).href
  script.addEventListener('error', () => fail(new Error('独立编辑器入口加载失败')), { once: true })
  editorWindow.document.body.append(script)
  editorWindow.focus()
  return {
    window: editorWindow,
    ready,
    update(snapshot) {
      if (!disposed) channel.port1.postMessage(snapshot)
    },
    dispose,
  }
}

/**
 * 把 html/body 上的 class 与内联样式同步到新文档，并跟随主窗口持续更新。
 *
 * 只同步主题变量与文档外观，不克隆宿主的 CodeMirror 动态样式，避免两个运行时的样式编号冲突。
 */
function mirrorDocumentShell(
  source: Document,
  target: Document,
  styleHost: HTMLElement | null,
): () => void {
  const pairs: ReadonlyArray<readonly [HTMLElement, HTMLElement]> = [
    [source.documentElement, target.documentElement],
    [source.body, target.body],
  ]
  const mirror = () => {
    for (const [from, to] of pairs) {
      to.setAttribute('class', from.getAttribute('class') ?? '')
      to.setAttribute('style', from.getAttribute('style') ?? '')
    }
    if (styleHost) {
      const style = getComputedStyle(styleHost)
      for (const property of style) {
        if (property.startsWith('--klc-'))
          target.body.style.setProperty(property, style.getPropertyValue(property))
      }
    }
  }
  mirror()
  const observer = new MutationObserver(mirror)
  for (const [from] of pairs) {
    observer.observe(from, { attributes: true, attributeFilter: ['class', 'style'] })
  }
  if (styleHost)
    observer.observe(styleHost, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    })
  return () => observer.disconnect()
}
