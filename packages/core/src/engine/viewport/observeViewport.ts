import type { ViewportStateModule } from '../state/viewportState.js'

/** 将容器测量和原生滚动转交给图表，卸载时释放同一组监听。 */
export function observeViewport(
  container: HTMLElement,
  resize: ViewportStateModule['actions']['resize'],
  onScroll: () => void,
): () => void {
  container.addEventListener('scroll', onScroll, { passive: true })
  resize(Math.round(container.clientWidth), Math.round(container.clientHeight), 0)
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(([entry]) => {
    if (!entry) return
    const physical = entry.devicePixelContentBoxSize?.[0]?.inlineSize
    const logical = entry.contentBoxSize?.[0]?.inlineSize
    const dpr = physical !== undefined && logical && logical > 0
      ? Math.round(physical / logical * 64) / 64
      : 0
    resize(Math.round(entry.contentRect.width), Math.round(entry.contentRect.height), dpr)
  })
  if (observer) {
    try {
      observer.observe(container, { box: 'device-pixel-content-box' })
    } catch {
      observer.observe(container)
    }
  }
  return () => {
    observer?.disconnect()
    container.removeEventListener('scroll', onScroll)
  }
}
