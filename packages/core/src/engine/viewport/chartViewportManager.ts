import type { ChartDom } from '../chartTypes'
import type { ChartStateKernel } from '../state/chartStateKernel'

/** DOM 生命周期依赖：ResizeObserver / scroll 监听 */
export interface ViewportDependencies {
  getDom: () => ChartDom
  onResizeCompleted: () => void
}

/**
 * Viewport DOM 适配层：只挂 ResizeObserver 与 scroll，读写一律走 kernel。
 */
export class ChartViewportManager {
  private deps: ViewportDependencies
  private kernel: ChartStateKernel
  private resizeObserver?: ResizeObserver
  private onScroll?: (e: Event) => void

  constructor(deps: ViewportDependencies, kernel: ChartStateKernel) {
    this.deps = deps
    this.kernel = kernel
  }

  init(): void {
    const target = this.deps.getDom().container
    if (!target) return

    // 首帧尺寸写入 kernel，不依赖 ResizeObserver 是否可用
    this.kernel.initViewport()

    this.onScroll = () => {
      this.kernel.viewport.actions.syncFromDomScroll()
    }
    target.addEventListener('scroll', this.onScroll, { passive: true })

    if (typeof ResizeObserver === 'undefined') return

    this.resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return

      const prevWidth = this.kernel.viewport.readonly.viewWidth.peek()
      const prevHeight = this.kernel.viewport.readonly.viewHeight.peek()
      const prevDpr = this.kernel.viewport.readonly.preciseDpr.peek()

      const cssWidth = Math.max(1, Math.round(entry.contentRect.width))
      const cssHeight = Math.max(1, Math.round(entry.contentRect.height))

      let preciseDpr = 0
      const pixelSize = entry.devicePixelContentBoxSize?.[0]
      const cssSize = entry.contentBoxSize?.[0]
      if (pixelSize && cssSize && cssSize.inlineSize > 0) {
        const raw = pixelSize.inlineSize / cssSize.inlineSize
        preciseDpr = Math.round(raw * 64) / 64
      }

      this.kernel.viewport.actions.resize(cssWidth, cssHeight, preciseDpr)

      const widthChanged = cssWidth !== prevWidth
      const heightChanged = cssHeight !== prevHeight
      const dprChanged = preciseDpr !== prevDpr
      if ((import.meta as any).env?.MODE !== 'production') {
        console.log(
          `[Chart] resize observer: ` +
            `size ${prevWidth}x${prevHeight} -> ${cssWidth}x${cssHeight} ` +
            `dpr ${prevDpr} -> ${preciseDpr} ` +
            `changed: ${widthChanged || heightChanged ? 'size' : ''}${widthChanged || (heightChanged && dprChanged) ? '+' : ''}${dprChanged ? 'dpr' : ''}`,
        )
      }
      if (widthChanged || heightChanged || dprChanged) {
        this.deps.onResizeCompleted()
      }
    })

    try {
      this.resizeObserver.observe(target, {
        box: 'device-pixel-content-box' as ResizeObserverBoxOptions,
      })
    } catch {
      this.resizeObserver.observe(target)
    }
  }

  destroy(): void {
    this.resizeObserver?.disconnect()
    this.resizeObserver = undefined

    if (this.onScroll) {
      this.deps.getDom().container?.removeEventListener('scroll', this.onScroll)
      this.onScroll = undefined
    }
  }
}
