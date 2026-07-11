import { type Signal, type ReadonlySignal } from '../../foundation/reactivity/signal'
import type { ChartDom, Viewport, ViewportState } from '../chartTypes'
import type { VisibleRange } from '../layout/pane'
import {
  createViewportState,
  type ViewportStateModule,
  type ViewportDeps,
} from '../state/viewportState'

/** Minimal manager-level deps (DOM + lifecycle callbacks). */
export interface ViewportDependencies {
  getDom: () => ChartDom
  onResizeCompleted: () => void
}

export class ChartViewportManager {
  private deps: ViewportDependencies
  private state: ViewportStateModule
  private resizeObserver?: ResizeObserver
  private onScroll?: () => void

  get viewportSignal(): Signal<ViewportState> {
    return this.state.readonly.viewportState as unknown as Signal<ViewportState>
  }

  constructor(deps: ViewportDependencies, kernelDeps: ViewportDeps) {
    this.deps = deps
    this.state = createViewportState(kernelDeps)
  }

  setContentWidthProvider(fn: (() => number) | null): void {
    this.state.actions.setContentWidthProvider(fn)
  }

  getCachedScrollLeft(): number {
    return this.state.readonly.scrollLeft.peek()
  }

  getLogicalScrollLeft(): number {
    return this.state.readonly.scrollLeftLogical.peek()
  }

  getViewport(): Viewport | null {
    if (this.state.readonly.viewWidth.peek() === 0) return null
    return this.state.readonly.viewport.peek()
  }

  getEffectiveDpr(): number {
    return this.state.readonly.dpr.peek()
  }

  getObservedSize(): { width: number; height: number } {
    return {
      width: this.state.readonly.viewWidth.peek(),
      height: this.state.readonly.viewHeight.peek(),
    }
  }

  setScrollLeft(v: number): void {
    this.state.actions.scrollTo(v)
  }

  init(): void {
    if (typeof ResizeObserver === 'undefined') return

    const target = this.deps.getDom().container
    if (!target) return

    this.state.actions.init()

    this.onScroll = () => {
      this.state.actions.syncFromDomScroll()
    }
    target.addEventListener('scroll', this.onScroll, { passive: true })

    this.resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return

      const prevWidth = this.state.readonly.viewWidth.peek()
      const prevHeight = this.state.readonly.viewHeight.peek()
      const prevDpr = this.state.readonly.preciseDpr.peek()

      const cssWidth = Math.max(1, Math.round(entry.contentRect.width))
      const cssHeight = Math.max(1, Math.round(entry.contentRect.height))

      let preciseDpr = 0
      const pixelSize = entry.devicePixelContentBoxSize?.[0]
      const cssSize = entry.contentBoxSize?.[0]
      if (pixelSize && cssSize && cssSize.inlineSize > 0) {
        const raw = pixelSize.inlineSize / cssSize.inlineSize
        preciseDpr = Math.round(raw * 64) / 64
      }

      this.state.actions.resize(cssWidth, cssHeight, preciseDpr)

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

    this.state.dispose()
  }

  computeViewport(): Viewport | null {
    const container = this.deps.getDom().container
    if (!container) return null

    const viewWidth = this.state.readonly.viewWidth.peek()
    const viewHeight = this.state.readonly.viewHeight.peek()
    if (viewWidth === 0 || viewHeight === 0) {
      const fallbackW = Math.max(1, Math.round(container.clientWidth))
      const fallbackH = Math.max(1, Math.round(container.clientHeight))
      if (fallbackW > 0 && fallbackH > 0) {
        this.state.actions.resize(fallbackW, fallbackH, this.state.readonly.preciseDpr.peek())
      }
    }

    return this.state.readonly.viewport.peek()
  }

  /** @deprecated No-op — viewportState is now computed(). */
  updateViewportSignal(): void {
    // no-op
  }

  /** Expose visibleRange signal for interactionState deps. */
  get visibleRangeSignal(): ReadonlySignal<VisibleRange | null> {
    return this.state.readonly.visibleRange as unknown as ReadonlySignal<VisibleRange | null>
  }

  /** Expose scrollLeftLogical signal for interactionState deps. */
  get scrollLeftLogicalSignal(): ReadonlySignal<number> {
    return this.state.readonly.scrollLeftLogical as ReadonlySignal<number>
  }

  /** Expose dpr signal for interactionState deps. */
  get dprSignal(): ReadonlySignal<number> {
    return this.state.readonly.dpr as ReadonlySignal<number>
  }
}
