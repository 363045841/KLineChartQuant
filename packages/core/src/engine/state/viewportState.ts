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

export interface ViewportDeps {
  /**
   * DOM 访问器。
   *
   * @remarks 仅在 effect（副作用）中使用，不进入 computed 推导链。
   */
  getDom: () => {
    container: HTMLElement | null
    scrollContent?: HTMLElement | null
    canvasLayer: HTMLElement | null
    xAxisCanvas: HTMLCanvasElement | null
  }

  /**
   * ReadonlySignal 输入 —— 所有字段均被响应式系统追踪。
   *
   * @remarks 此对象中的每个 signal 变更都会触发依赖的 computed 重求值。
   */
  options$: ReadonlySignal<{
    bottomAxisHeight: number
    kWidth: number
    kGap: number
  }>
  dataLength$: ReadonlySignal<number>
  zoomLevel$: ReadonlySignal<number>

  /**
   * Side-effect 回调。
   *
   * @remarks 仅在 effect 中调用，不进入 computed 推导链。
   */
  resizeSharedWebGLSurface: (plotWidth: number, plotHeight: number, dpr: number) => void
  onResizeCompleted: () => void
}

export function createViewportState(deps: ViewportDeps) {
  // ── 纯推导辅助函数 ──

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

  // ── 子状态：writable signals + computed 推导 ──
  //
  // 重要：每个 computed 函数接收 (s)，s 中只包含 source signals（可写状态键）。
  // computed 之间的依赖链不被支持；中间推导应 inline 展开而非链式引用。

  const { signals, readonly } = createSubState(
    // 原始状态初始值
    {
      scrollLeft: 0,
      viewWidth: 0,
      viewHeight: 0,
      preciseDpr: 0,
      initialized: false,
    },
    // Computed 计算属性
    {
      /**
       * Effective DPR（钳制后）。
       *
       * @remarks 由 viewWidth、viewHeight、preciseDpr 联合推导。
       */
      dpr: (s) => computeDpr(s.viewWidth(), s.viewHeight(), s.preciseDpr()),
      /**
       * 物理画布绘图宽度。
       *
       * @remarks 即 viewWidth 的取整值。
       */
      plotWidth: (s) => computePlotWidth(s.viewWidth()),
      /**
       * 物理画布绘图高度。
       *
       * @remarks 即 viewHeight 减去 bottomAxisHeight。
       */
      plotHeight: (s) => computePlotHeight(s.viewHeight()),
      /**
       * 左侧加载缓冲宽度。
       *
       * @remarks 由 dataLength 与 viewWidth 联合推导；无数据时返回 0。
       */
      leftLoadBufferWidth: (s) => computeLeftLoadBufferWidth(s.viewWidth()),
      /**
       * 逻辑 scrollLeft（CSS px，原点为数据起始位置）。
       *
       * @remarks 已减去 leftLoadBufferWidth 偏移。
       */
      scrollLeftLogical: (s) => s.scrollLeft() - computeLeftLoadBufferWidth(s.viewWidth()),
      /**
       * 当前可见范围。
       *
       * @remarks 由 viewport、options、dataLength 联合推导，供渲染引擎判断数据切片。
       */
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
      /**
       * 完整的 Viewport 对象。
       *
       * @remarks 返回包含 viewWidth、viewHeight、plotWidth、plotHeight、
       * scrollLeft（DPR 取整）及 dpr 的结构体。
       */
      viewport: (s) =>
        computeViewport(
          s.viewWidth(),
          s.viewHeight(),
          s.scrollLeft(),
          computeLeftLoadBufferWidth(s.viewWidth()),
          s.preciseDpr(),
        ),
      /**
       * ViewportState 快照，供渲染器与 UI 消费。
       *
       * @remarks 包含 zoomLevel、plotWidth/Height、dpr、visibleFrom/To、
       * kWidth、kGap 等渲染管线所需参数的扁平结构。
       */
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
      deps.resizeSharedWebGLSurface(plotWidth, plotHeight, dpr)
    })
    scrollDomEffect = effect(() => {
      if (!readonly.initialized()) return
      const scrollLeft = readonly.scrollLeft()
      const dom = deps.getDom()
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

  /**
   * 将 DPR 及视口尺寸同步到 DOM canvas 元素的尺寸与样式。
   *
   * @param dpr - 当前 effective DPR
   * @param viewWidth - 视口 CSS 宽度
   * @param viewHeight - 视口 CSS 高度
   */
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

  // ── Actions（外部消费者变更内部状态入口） ──

  let _contentWidthProvider: (() => number) | null = null

  return {
    readonly,

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
        const container = deps.getDom().container
        if (container) signals.scrollLeft.set(container.scrollLeft)
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
        const container = deps.getDom().container
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
