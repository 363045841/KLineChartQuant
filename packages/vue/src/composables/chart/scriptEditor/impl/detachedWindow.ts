/**
 * 承载脚本编辑器的普通浏览器独立窗口。
 *
 * 新窗口是一个全新的 document，既没有主应用的样式表，也没有写在 html/body 上的主题变量。
 * 这里负责复制样式表并持续镜像 html/body 的 class 与内联样式，让编辑器在新窗口里与主窗口一致。
 */

/** 独立编辑器窗口的初始尺寸（px）。 */
const DETACHED_WINDOW_SIZE = { width: 760, height: 560 } as const

/** 当前环境是否支持打开浏览器窗口。 */
export function supportsDetachedWindow(): boolean {
  return typeof window !== 'undefined' && typeof window.open === 'function'
}

/** 独立窗口句柄：窗口本体、编辑器挂载点与清理函数。 */
export interface DetachedWindow {
  /** 窗口本体，用于聚焦与监听关闭。 */
  readonly window: Window
  /** 编辑器在新窗口中的挂载点，直接使用新文档的 body。 */
  readonly container: HTMLElement
  /** 关闭窗口并停止样式镜像。 */
  dispose(): void
}

/**
 * 打开承载脚本编辑器的独立窗口。
 * @param title 写入新窗口的 document.title，避免标题栏显示为空。
 * @param styleHost 编辑器所在的宿主元素：普通应用在 document 里，Web Component 在 shadow root 里。
 */
export async function openDetachedWindow(
  title: string,
  styleHost: HTMLElement | null,
): Promise<DetachedWindow> {
  // 在点击事件内同步打开，保留浏览器要求的用户激活状态。
  const editorWindow = window.open(
    '',
    '_blank',
    `popup=yes,width=${DETACHED_WINDOW_SIZE.width},height=${DETACHED_WINDOW_SIZE.height},resizable=yes,scrollbars=yes`,
  )
  if (!editorWindow) throw new Error('无法打开编辑器窗口，请允许浏览器弹出窗口后重试')
  editorWindow.document.title = title
  copyStylesheets(styleHost, editorWindow.document)
  const stopMirroring = mirrorDocumentShell(document, editorWindow.document)
  let disposed = false
  /** 主页面退出或组件卸载时，同时释放窗口与样式镜像。 */
  const dispose = (): void => {
    if (disposed) return
    disposed = true
    window.removeEventListener('pagehide', dispose)
    stopMirroring()
    editorWindow.close()
  }
  window.addEventListener('pagehide', dispose)
  editorWindow.focus()
  return {
    window: editorWindow,
    container: editorWindow.document.body,
    dispose,
  }
}

/**
 * 克隆编辑器样式来源中的所有样式表节点。
 *
 * 宿主在 shadow root 里时（Web Component 构建），组件样式只存在于 shadow root，
 * 必须与文档级样式一起复制；文档级在前，shadow 级在后，保持内层优先。
 * link 交给浏览器重新加载，避免跨域读取 cssRules。
 */
function copyStylesheets(styleHost: HTMLElement | null, target: Document): void {
  const shadowRoot = styleHost?.getRootNode()
  const sources: readonly ParentNode[] =
    shadowRoot instanceof ShadowRoot ? [document, shadowRoot] : [document]
  for (const source of sources) {
    for (const style of source.querySelectorAll('style, link[rel="stylesheet"]')) {
      target.head.append(style.cloneNode(true))
    }
  }
}

/**
 * 把 html/body 上的 class 与内联样式同步到新文档，并跟随主窗口持续更新。
 *
 * 主题 CSS 变量由 useChartTheme 写在 body 的内联样式上，是编辑器取色的唯一来源。
 */
function mirrorDocumentShell(source: Document, target: Document): () => void {
  const pairs: ReadonlyArray<readonly [HTMLElement, HTMLElement]> = [
    [source.documentElement, target.documentElement],
    [source.body, target.body],
  ]
  const mirror = () => {
    for (const [from, to] of pairs) {
      to.setAttribute('class', from.getAttribute('class') ?? '')
      to.setAttribute('style', from.getAttribute('style') ?? '')
    }
  }
  mirror()
  const observer = new MutationObserver(mirror)
  for (const [from] of pairs) {
    observer.observe(from, { attributes: true, attributeFilter: ['class', 'style'] })
  }
  return () => observer.disconnect()
}
