import {
  createSubState,
  computed,
  batch,
  effect,
  type ReadonlySignal,
} from '../../foundation/reactivity/signal'
import type { Viewport, ViewportState } from '../chartTypes'
import type { VisibleRange } from '../layout/pane'
import { getVisibleRange } from '../viewport/viewport'

/**
 * 钳制 effective DPR，避免超出 MAX_CANVAS_PIXELS 上限。
 *
 * @param viewWidth   视口 CSS 宽度
 * @param viewHeight  视口 CSS 高度
 * @param effectiveDpr 当前有效 DPR
 * @param maxCanvasPixels 像素上限（默认 16M）
 * @returns 钳制后的 DPR
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
 * 根据 preciseDpr 与 window.devicePixelRatio 计算 effective DPR。
 *
 * @remarks Electron 环境下走特殊逻辑：忽略 preciseDpr，直接读取系统 DPR。
 *
 * @param preciseDpr - 用户配置的高精度 DPR（0 表示自动）
 * @returns 最终生效的 DPR，最低为 1
 */
export function getEffectiveDprLogic(preciseDpr: number): number {
  if (typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron')) {
    return Math.max(1, (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1)
  }
  if (preciseDpr > 0) return preciseDpr
  const dpr = Math.round((typeof window !== 'undefined' ? window.devicePixelRatio : 1) * 64) / 64
  return Math.max(1, dpr || 1)
}

/**
 * ReadonlySignal 输入 —— 所有字段均被响应式系统追踪。
 * 可在 kernel constructor 中直接使用（无 DOM 依赖）。
 */
export interface ViewportSignalDeps {
  options$: ReadonlySignal<{
    bottomAxisHeight: number
    kWidth: number
    kGap: number
  }>
  dataLength$: ReadonlySignal<number>
  zoomLevel$: ReadonlySignal<number>
}

/**
 * DOM 与 side-effect 回调。
 * kernel 外部注入，init() 前调用 setDomDeps() 设置。
 */
export interface ViewportDomDeps {
  getDom: () => {
    container: HTMLElement | null
    scrollContent?: HTMLElement | null
    canvasLayer: HTMLElement | null
    xAxisCanvas: HTMLCanvasElement | null
  }
  resizeSharedWebGLSurface: (plotWidth: number, plotHeight: number, dpr: number) => void
}

const NULL_DOM_RETURN: ReturnType<ViewportDomDeps['getDom']> = {
  container: null,
  canvasLayer: null,
  xAxisCanvas: null,
}

export function createViewportState(signalDeps: ViewportSignalDeps) {
  let _domDeps: ViewportDomDeps | undefined

  const _getDom = () => (_domDeps ? _domDeps.getDom() : NULL_DOM_RETURN)
  const _resizeSharedWebGLSurface = (w: number, h: number, dpr: number) => {
    if (_domDeps) _domDeps.resizeSharedWebGLSurface(w, h, dpr)
  }

  const computeDpr = (viewWidth: number, viewHeight: number, preciseDpr: number): number => {
    const eff = getEffectiveDprLogic(preciseDpr)
    return clampDpr(Math.max(1, viewWidth), Math.max(1, viewHeight), eff)
  }

  const computePlotWidth = (viewWidth: number): number => Math.round(viewWidth)
  const computePlotHeight = (viewHeight: number): number =>
    Math.round(viewHeight - signalDeps.options$().bottomAxisHeight)

  const computeLeftLoadBufferWidth = (viewWidth: number): number => {
    const dl = signalDeps.dataLength$()
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

  const { signals, readonly } = createSubState(
    {
      scrollLeft: 0,
      viewWidth: 0,
      viewHeight: 0,
      preciseDpr: 0,
      initialized: false,
    },
    {
      dpr: (s) => computeDpr(s.viewWidth(), s.viewHeight(), s.preciseDpr()),
      plotWidth: (s) => computePlotWidth(s.viewWidth()),
      plotHeight: (s) => computePlotHeight(s.viewHeight()),
      leftLoadBufferWidth: (s) => computeLeftLoadBufferWidth(s.viewWidth()),
      scrollLeftLogical: (s) => s.scrollLeft() - computeLeftLoadBufferWidth(s.viewWidth()),
    },
  )

  // ── 带引用缓存的 computed —— 仅在字段值实际变化时返回新对象 ──
  // 避免 Object.is 短路失效导致下游 effect / Vue 订阅在子像素滚动时虚假重跑

  let _cachedViewport: Viewport | null = null
  const cachedViewport = computed<Viewport>(() => {
    const vp = computeViewport(
      readonly.viewWidth(),
      readonly.viewHeight(),
      readonly.scrollLeft(),
      readonly.leftLoadBufferWidth(),
      readonly.preciseDpr(),
    )
    if (
      _cachedViewport &&
      _cachedViewport.viewWidth === vp.viewWidth &&
      _cachedViewport.viewHeight === vp.viewHeight &&
      _cachedViewport.plotWidth === vp.plotWidth &&
      _cachedViewport.plotHeight === vp.plotHeight &&
      _cachedViewport.scrollLeft === vp.scrollLeft &&
      _cachedViewport.dpr === vp.dpr
    ) {
      return _cachedViewport
    }
    _cachedViewport = vp
    return vp
  })

  let _cachedVisibleRange: VisibleRange | null = null
  const cachedVisibleRange = computed<VisibleRange>(() => {
    const vp = cachedViewport()
    const opts = signalDeps.options$()
    const vr = getVisibleRange(
      vp.scrollLeft,
      vp.plotWidth,
      opts.kWidth,
      opts.kGap,
      signalDeps.dataLength$(),
      vp.dpr,
    )
    if (_cachedVisibleRange && _cachedVisibleRange.start === vr.start && _cachedVisibleRange.end === vr.end) {
      return _cachedVisibleRange
    }
    _cachedVisibleRange = vr
    return vr
  })

  let _cachedViewportState: ViewportState | null = null
  const cachedViewportState = computed<ViewportState>(() => {
    const vp = cachedViewport()
    const vr = cachedVisibleRange()
    const opts = signalDeps.options$()
    const next: ViewportState = {
      zoomLevel: signalDeps.zoomLevel$(),
      plotWidth: vp.plotWidth,
      plotHeight: vp.plotHeight,
      dpr: vp.dpr,
      visibleFrom: vr.start,
      visibleTo: vr.end,
      kWidth: opts.kWidth,
      kGap: opts.kGap,
    }
    if (
      _cachedViewportState &&
      _cachedViewportState.zoomLevel === next.zoomLevel &&
      _cachedViewportState.plotWidth === next.plotWidth &&
      _cachedViewportState.plotHeight === next.plotHeight &&
      _cachedViewportState.dpr === next.dpr &&
      _cachedViewportState.visibleFrom === next.visibleFrom &&
      _cachedViewportState.visibleTo === next.visibleTo &&
      _cachedViewportState.kWidth === next.kWidth &&
      _cachedViewportState.kGap === next.kGap
    ) {
      return _cachedViewportState
    }
    _cachedViewportState = next
    return next
  })

  // ── DOM 副作用（effect） ──
  // compute 负责内部状态计算属性，effect 负责将状态同步到外界
  // effect 的监听行为是自动的，但它的启动时机是手动控制的

  let canvasDomEffect: (() => void) | null = null
  let webglEffect: (() => void) | null = null
  let scrollDomEffect: (() => void) | null = null

  /**
   * 挂载 canvas DOM 尺寸与 WebGL surface 的同步 effect。
   *
   * @remarks init() 时调用，返回的清理函数由 dispose() 执行。
   */
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
      _resizeSharedWebGLSurface(plotWidth, plotHeight, dpr)
    })
    scrollDomEffect = effect(() => {
      if (!readonly.initialized()) return
      const scrollLeft = readonly.scrollLeft()
      const dom = _getDom()
      const container = dom.container
      if (container && container.scrollLeft !== scrollLeft) {
        container.scrollLeft = scrollLeft
      }
      if (_contentWidthProvider && dom.scrollContent) {
        const w = _contentWidthProvider() + 'px'
        if (dom.scrollContent.style.width !== w) dom.scrollContent.style.width = w
      }
    })
  }

  const syncCanvasDom = (dpr: number, viewWidth: number, viewHeight: number): void => {
    const dom = _getDom()
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

    const xAxisHeight = Math.round(signalDeps.options$().bottomAxisHeight * dpr)
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

  // ── Actions（外部消费者变更内部状态入口） ──

  // ── 合并 readonly：原始 subState + 缓存 computed ──
  const mergedReadonly = {
    ...readonly,
    viewport: cachedViewport,
    visibleRange: cachedVisibleRange,
    viewportState: cachedViewportState,
  }

  let _contentWidthProvider: (() => number) | null = null

  return {
    readonly: mergedReadonly,

    setDomDeps(deps: ViewportDomDeps) {
      _domDeps = deps
    },

    actions: {
      /**
       * 滚动到指定 scrollLeft 位置。
       *
       * @remarks 仅更新内部信号，DOM 同步由 effect 负责。
       *
       * @param v - 目标 scrollLeft（CSS px）
       */
      scrollTo(v: number) {
        signals.scrollLeft.set(v)
      },

      /**
       * 从 DOM 容器的 scrollLeft 同步状态。
       *
       * @remarks 在外部滚动事件中调用，使 signal 与 DOM 保持一致。
       */
      syncFromDomScroll() {
        const container = _getDom().container
        if (container) {
          const v = container.scrollLeft
          batch(() => { signals.scrollLeft.set(v) })
        }
      },

      /**
       * 响应容器尺寸变化，更新视口尺寸与 DPR。
       *
       * @remarks 首次初始化时若 scrollLeft 为 0，自动设为 viewWidth 以触发初始渲染。
       * 三个字段在 batch() 内同步写入，保证 computed 只触发一次重求值，只触发一次重绘。
       *
       * @param width  - 新视口 CSS 宽度
       * @param height - 新视口 CSS 高度
       * @param dpr    - 新精确 DPR
       */
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

      /**
       * 注入 contentWidth 提供器。
       *
       * @param fn - 返回内容区总宽度的函数，或 null 以清除
       */
      setContentWidthProvider(fn: (() => number) | null) {
        _contentWidthProvider = fn
      },

      /**
       * 初始化视口状态。
       *
       * @remarks 从 DOM 容器读取当前 scrollLeft，并挂载 canvas 尺寸同步 effect。
       * 重复调用安全（仅首次生效）。
       */
      init() {
        if (signals.initialized.peek()) return
        if (!_domDeps) return
        const container = _getDom().container
        if (!container) return
        signals.initialized.set(true)
        signals.scrollLeft.set(container.scrollLeft)
        setupCanvasSync()
      },
    },

    /**
     * 清理所有 effect 并重置状态。
     *
     * @remarks 图表销毁时调用。取消 DOM 同步与 WebGL 回调，
     * 将 writable signals 归零。
     */
    dispose() {
      canvasDomEffect?.()
      webglEffect?.()
      scrollDomEffect?.()
      canvasDomEffect = null
      webglEffect = null
      scrollDomEffect = null
      signals.initialized.set(false)
      signals.preciseDpr.set(0)
      signals.viewWidth.set(0)
      signals.viewHeight.set(0)
    },
  }
}

export type ViewportStateModule = ReturnType<typeof createViewportState>
