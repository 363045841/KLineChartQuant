import {
  createSubState,
  batch,
  effect,
  type ReadonlySignal,
} from '../../foundation/reactivity/signal'
import type { Viewport, ViewportState } from '../chartTypes'
import type { VisibleRange } from '../layout/pane'
import { getVisibleRange } from '../viewport/viewport'

/**
 * Pure function: clamp DPR to avoid exceeding MAX_CANVAS_PIXELS.
 */
export function clampDpr(
  viewWidth: number,
  viewHeight: number,
  effectiveDpr: number,
  maxCanvasPixels = 16 * 1024 * 1024,
): number {
  if (viewWidth * effectiveDpr * (viewHeight * effectiveDpr) > maxCanvasPixels) {
    return Math.sqrt(maxCanvasPixels / (viewWidth * viewHeight))
  }
  return effectiveDpr
}

/**
 * Pure: compute the effective DPR from preciseDpr + window.devicePixelRatio.
 * Includes Electron-specific handling.
 */
export function getEffectiveDprLogic(preciseDpr: number): number {
  if (typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron')) {
    return Math.max(1, (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1)
  }
  if (preciseDpr > 0) return preciseDpr
  const dpr = Math.round((typeof window !== 'undefined' ? window.devicePixelRatio : 1) * 64) / 64
  return Math.max(1, dpr || 1)
}

export interface ViewportDeps {
  /** DOM access (side-effect only, not used inside computed). */
  getDom: () => {
    container: HTMLElement | null
    scrollContent?: HTMLElement | null
    canvasLayer: HTMLElement | null
    xAxisCanvas: HTMLCanvasElement | null
  }

  /** ReadonlySignal inputs — all tracked by the reactive system. */
  options$: ReadonlySignal<{
    bottomAxisHeight: number
    kWidth: number
    kGap: number
  }>
  dataLength$: ReadonlySignal<number>
  zoomLevel$: ReadonlySignal<number>

  /** Side-effect callbacks (not used inside computed). */
  resizeSharedWebGLSurface: (plotWidth: number, plotHeight: number, dpr: number) => void
  onResizeCompleted: () => void
}

export function createViewportState(deps: ViewportDeps) {
  // ── Pure derivation helpers ──

  const computeDpr = (viewWidth: number, viewHeight: number, preciseDpr: number): number => {
    const eff = getEffectiveDprLogic(preciseDpr)
    return clampDpr(Math.max(1, viewWidth), Math.max(1, viewHeight), eff)
  }

  const computePlotWidth = (viewWidth: number): number => Math.round(viewWidth)
  const computePlotHeight = (viewHeight: number): number =>
    Math.round(viewHeight - deps.options$().bottomAxisHeight)

  const computeLeftLoadBufferWidth = (viewWidth: number): number => {
    const dl = deps.dataLength$()
    return dl === 0 ? 0 : Math.round(viewWidth)
  }

  const computeViewport = (
    viewWidth: number,
    viewHeight: number,
    scrollLeftRaw: number,
    leftLoadBufferWidth: number,
    preciseDpr: number,
  ): Viewport => {
    const dpr = computeDpr(viewWidth, viewHeight, preciseDpr)
    const plotWidth = computePlotWidth(viewWidth)
    const plotHeight = computePlotHeight(viewHeight)
    const logicalScrollLeft = scrollLeftRaw - leftLoadBufferWidth
    const scrollLeft = Math.round(logicalScrollLeft * dpr) / dpr
    return { viewWidth, viewHeight, plotWidth, plotHeight, scrollLeft, dpr }
  }

  // ── Sub-state: writable signals + computed derivations ──
  //
  // IMPORTANT: each computed function receives `(s)` — only the source
  // signals (writable state keys). Computed-to-computed dependencies
  // are NOT supported; inline any intermediate derivation instead.

  const { signals, readonly } = createSubState(
    {
      scrollLeft: 0,
      viewWidth: 0,
      viewHeight: 0,
      preciseDpr: 0,
      initialized: false,
    },
    {
      /** Effective DPR (post-clamp). */
      dpr: (s) => computeDpr(s.viewWidth(), s.viewHeight(), s.preciseDpr()),
      /** Physical plot width. */
      plotWidth: (s) => computePlotWidth(s.viewWidth()),
      /** Physical plot height. */
      plotHeight: (s) => computePlotHeight(s.viewHeight()),
      /** Left load buffer width — derived from dataLength + viewWidth. */
      leftLoadBufferWidth: (s) => computeLeftLoadBufferWidth(s.viewWidth()),
      /** Logical scrollLeft (CSS px, origin at data start). */
      scrollLeftLogical: (s) => s.scrollLeft() - computeLeftLoadBufferWidth(s.viewWidth()),
      /** Visible range — derived from viewport + options + dataLength. */
      visibleRange: (s) => {
        const vp = computeViewport(
          s.viewWidth(),
          s.viewHeight(),
          s.scrollLeft(),
          computeLeftLoadBufferWidth(s.viewWidth()),
          s.preciseDpr(),
        )
        const opts = deps.options$()
        return getVisibleRange(
          vp.scrollLeft,
          vp.plotWidth,
          opts.kWidth,
          opts.kGap,
          deps.dataLength$(),
          vp.dpr,
        )
      },
      /** Full Viewport object, DPR-rounded scrollLeft. */
      viewport: (s) =>
        computeViewport(
          s.viewWidth(),
          s.viewHeight(),
          s.scrollLeft(),
          computeLeftLoadBufferWidth(s.viewWidth()),
          s.preciseDpr(),
        ),
      /** ViewportState snapshot consumed by renderers + UI. */
      viewportState: (s) => {
        const llbw = computeLeftLoadBufferWidth(s.viewWidth())
        const vp = computeViewport(
          s.viewWidth(),
          s.viewHeight(),
          s.scrollLeft(),
          llbw,
          s.preciseDpr(),
        )
        const opts = deps.options$()
        const vr = getVisibleRange(
          vp.scrollLeft,
          vp.plotWidth,
          opts.kWidth,
          opts.kGap,
          deps.dataLength$(),
          vp.dpr,
        )
        return {
          zoomLevel: deps.zoomLevel$(),
          plotWidth: vp.plotWidth,
          plotHeight: vp.plotHeight,
          dpr: vp.dpr,
          visibleFrom: vr.start,
          visibleTo: vr.end,
          kWidth: opts.kWidth,
          kGap: opts.kGap,
        }
      },
    },
  )

  // ── DOM side-effects (effects) ──

  let canvasDomEffect: (() => void) | null = null
  let webglEffect: (() => void) | null = null

  const setupCanvasSync = (): void => {
    canvasDomEffect = effect(() => {
      if (!readonly.initialized()) return
      const viewWidth = readonly.viewWidth()
      const viewHeight = readonly.viewHeight()
      if (viewWidth <= 0 || viewHeight <= 0) return
      const dpr = readonly.dpr()
      syncCanvasDom(dpr, viewWidth, viewHeight)
    })
    webglEffect = effect(() => {
      if (!readonly.initialized()) return
      const plotWidth = readonly.plotWidth()
      const plotHeight = readonly.plotHeight()
      if (plotWidth <= 0 || plotHeight <= 0) return
      const dpr = readonly.dpr()
      deps.resizeSharedWebGLSurface(plotWidth, plotHeight, dpr)
    })
  }

  const syncCanvasDom = (dpr: number, viewWidth: number, viewHeight: number): void => {
    const dom = deps.getDom()
    const canvasLayer = dom.canvasLayer
    const xAxisCanvas = dom.xAxisCanvas
    if (!canvasLayer || !xAxisCanvas) return

    const dprRoundedViewWidth = Math.round(viewWidth * dpr) / dpr

    const canvasLayerWidth = `${dprRoundedViewWidth}px`
    if (canvasLayer.style.width !== canvasLayerWidth) {
      canvasLayer.style.width = canvasLayerWidth
    }

    const canvasLayerHeight = `${viewHeight}px`
    if (canvasLayer.style.height !== canvasLayerHeight) {
      canvasLayer.style.height = canvasLayerHeight
    }

    const xAxisWidthPx = Math.round(dprRoundedViewWidth * dpr)
    if (xAxisCanvas.width !== xAxisWidthPx) {
      xAxisCanvas.width = xAxisWidthPx
    }

    const xAxisHeight = Math.round(deps.options$().bottomAxisHeight * dpr)
    if (xAxisCanvas.height !== xAxisHeight) {
      xAxisCanvas.height = xAxisHeight
    }

    const xAxisCssWidth = `${dprRoundedViewWidth}px`
    if (xAxisCanvas.style.width !== xAxisCssWidth) {
      xAxisCanvas.style.width = xAxisCssWidth
    }

    const xAxisCssHeight = `${xAxisHeight / dpr}px`
    if (xAxisCanvas.style.height !== xAxisCssHeight) {
      xAxisCanvas.style.height = xAxisCssHeight
    }
  }

  // ── Actions ──

  let _contentWidthProvider: (() => number) | null = null

  return {
    readonly,
    signals,

    actions: {
      scrollTo(v: number) {
        if (_contentWidthProvider) {
          const dom = deps.getDom()
          if (dom.scrollContent) {
            const w = _contentWidthProvider() + 'px'
            if (dom.scrollContent.style.width !== w) dom.scrollContent.style.width = w
          }
        }
        signals.scrollLeft.set(v)
        const container = deps.getDom().container
        if (container) container.scrollLeft = v
      },

      syncFromDomScroll() {
        const container = deps.getDom().container
        if (container) signals.scrollLeft.set(container.scrollLeft)
      },

      resize(width: number, height: number, dpr: number) {
        batch(() => {
          if (signals.scrollLeft.peek() === 0 && width > 0) {
            signals.scrollLeft.set(width)
          }
          signals.viewWidth.set(width)
          signals.viewHeight.set(height)
          signals.preciseDpr.set(dpr)
        })
      },

      setContentWidthProvider(fn: (() => number) | null) {
        _contentWidthProvider = fn
      },

      init() {
        if (signals.initialized.peek()) return
        const container = deps.getDom().container
        if (!container) return
        signals.initialized.set(true)
        signals.scrollLeft.set(container.scrollLeft)
        setupCanvasSync()
      },
    },

    dispose() {
      canvasDomEffect?.()
      webglEffect?.()
      canvasDomEffect = null
      webglEffect = null
      signals.initialized.set(false)
      signals.preciseDpr.set(0)
      signals.viewWidth.set(0)
      signals.viewHeight.set(0)
    },
  }
}

export type ViewportStateModule = ReturnType<typeof createViewportState>
