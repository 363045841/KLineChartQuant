/**
 * Document Picture-in-Picture 独立窗口。
 *
 * 新窗口是一个全新的 document，既没有主应用的样式表，也没有写在 html/body 上的主题变量。
 * 这里负责复制样式表并持续镜像 html/body 的 class 与内联样式，让编辑器在新窗口里与主窗口一致。
 */

/** TS 的 lib.dom 尚未内置该实验性 API，只声明本模块用到的部分。 */
interface DocumentPictureInPictureApi {
  requestWindow(options?: { readonly width?: number; readonly height?: number }): Promise<Window>
}

declare global {
  interface Window {
    /** 文档画中画入口；不支持的浏览器为 undefined。 */
    readonly documentPictureInPicture?: DocumentPictureInPictureApi
  }
}

/** 独立编辑器窗口的初始尺寸（px）。 */
const DETACHED_WINDOW_SIZE = { width: 760, height: 560 } as const

/** 当前环境是否支持文档画中画窗口。 */
export function supportsDetachedWindow(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.documentPictureInPicture?.requestWindow === 'function'
  )
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
  const api = window.documentPictureInPicture
  if (!api) throw new Error('当前浏览器不支持文档画中画窗口')
  const pipWindow = await api.requestWindow(DETACHED_WINDOW_SIZE)
  pipWindow.document.title = title
  copyStylesheets(styleHost, pipWindow.document)
  const stopMirroring = mirrorDocumentShell(document, pipWindow.document)
  let disposed = false
  return {
    window: pipWindow,
    container: pipWindow.document.body,
    dispose() {
      if (disposed) return
      disposed = true
      stopMirroring()
      pipWindow.close()
    },
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
