import { type Signal } from '../../foundation/reactivity/signal'
import type { ChartDom, Viewport, ViewportState } from '../chartTypes'
import type { ChartStateKernel } from '../state/chartStateKernel'

/** Minimal manager-level deps (DOM + lifecycle callbacks). */
export interface ViewportDependencies {
  getDom: () => ChartDom
  onResizeCompleted: () => void
}

export class ChartViewportManager {
  private deps: ViewportDependencies
  private kernel: ChartStateKernel
  private resizeObserver?: ResizeObserver
  private onScroll?: () => void

  get viewportSignal(): Signal<ViewportState> {
    return this.kernel.viewport.readonly.viewportState as unknown as Signal<ViewportState>
  }

  constructor(deps: ViewportDependencies, kernel: ChartStateKernel) {
    this.deps = deps
    this.kernel = kernel
  }

  setContentWidthProvider(fn: (() => number) | null): void {
    this.kernel.viewport.actions.setContentWidthProvider(fn)
  }

  getCachedScrollLeft(): number {
    return this.kernel.viewport.readonly.scrollLeft.peek()
  }

  getLogicalScrollLeft(): number {
    return this.kernel.viewport.readonly.scrollLeftLogical.peek()
  }

  getViewport(): Viewport | null {
    if (this.kernel.viewport.readonly.viewWidth.peek() === 0) return null
    return this.kernel.viewport.readonly.viewport.peek()
  }

  getEffectiveDpr(): number {
    return this.kernel.viewport.readonly.dpr.peek()
  }

  getObservedSize(): { width: number; height: number } {
    return {
      width: this.kernel.viewport.readonly.viewWidth.peek(),
      height: this.kernel.viewport.readonly.viewHeight.peek(),
    }
  }

  setScrollLeft(v: number): void {
    this.kernel.viewport.actions.scrollTo(v)
  }

  init(): void {
    if (typeof ResizeObserver === 'undefined') return

    const target = this.deps.getDom().container
    if (!target) return

    this.kernel.initViewport()

    this.onScroll = () => {
      this.kernel.viewport.actions.syncFromDomScroll()
    }
    target.addEventListener('scroll', this.onScroll, { passive: true })

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

  computeViewport(): Viewport | null {
    const container = this.deps.getDom().container
    if (!container) return null

    const viewWidth = this.kernel.viewport.readonly.viewWidth.peek()
    const viewHeight = this.kernel.viewport.readonly.viewHeight.peek()
    if (viewWidth === 0 || viewHeight === 0) {
      const fallbackW = Math.max(1, Math.round(container.clientWidth))
      const fallbackH = Math.max(1, Math.round(container.clientHeight))
      if (fallbackW > 0 && fallbackH > 0) {
        this.kernel.viewport.actions.resize(fallbackW, fallbackH, this.kernel.viewport.readonly.preciseDpr.peek())
      }
    }

    return this.kernel.viewport.readonly.viewport.peek()
  }

  /** @deprecated No-op — viewportState is now computed(). */
  updateViewportSignal(): void {
    // no-op
  }
}
