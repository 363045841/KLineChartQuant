import {
  createSubState,
  computed,
  batch,
  effect,
  type ReadonlySignal,
} from '../../foundation/reactivity/signal'
import type { Viewport, ViewportState } from '../chartTypes'
import type { VisibleRange } from '../layout/pane'
import { clampVisibleRange, getVisibleRange } from '../viewport/viewport'
import { computeTimeShareVisibleRange } from '../modes/timeShareMath'
import {
  computeLeftLoadBufferWidth as pureLeftBuffer,
  computeContentWidth as pureContentWidth,
  computeMaxScrollLeft as pureMaxScrollLeft,
} from './contentGeometry'
import { deriveKGap } from '../utils/zoom'

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
  }>
  dataLength$: ReadonlySignal<number>
  period$: ReadonlySignal<string>
  zoomLevel$: ReadonlySignal<number>
  /** 分时交易时段槽位数（由当前品种 market 经 MarketSessionRegistry 派生，与渲染器同源） */
  sessionSlots$?: ReadonlySignal<number>
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
      requestedScrollLeft: 0,
      viewWidth: 0,
      viewHeight: 0,
      preciseDpr: 0,
      initialized: false,
    },
    {
      dpr: (s) => computeDpr(s.viewWidth(), s.viewHeight(), s.preciseDpr()),
      plotWidth: (s) => computePlotWidth(s.viewWidth()),
      plotHeight: (s) => computePlotHeight(s.viewHeight()),
      leftLoadBufferWidth: (s) =>
        pureLeftBuffer({
          viewWidth: s.viewWidth(),
          plotWidth: Math.round(s.viewWidth()),
          dataLength: signalDeps.dataLength$(),
          period: signalDeps.period$(),
          dpr: 1,
          kWidth: 0,
          kGap: 0,
        }),
    },
  )

  const kGap = computed<number>(() => {
    return deriveKGap({
      kWidth: signalDeps.options$().kWidth,
      dpr: readonly.dpr(),
      period: signalDeps.period$(),
    })
  })

  const contentWidth = computed(() => {
    const options = signalDeps.options$()
    return pureContentWidth({
      viewWidth: readonly.plotWidth(),
      plotWidth: readonly.plotWidth(),
      dataLength: signalDeps.dataLength$(),
      period: signalDeps.period$(),
      dpr: readonly.dpr(),
      kWidth: options.kWidth,
      kGap: kGap(),
      sessionSlots: signalDeps.sessionSlots$?.() ?? 0,
    })
  })
  const maxScrollLeft = computed(() => pureMaxScrollLeft(contentWidth(), readonly.viewWidth()))
  const scrollLeft = computed(() =>
    Math.max(0, Math.min(readonly.requestedScrollLeft(), maxScrollLeft())),
  )
  const scrollLeftLogical = computed(() => scrollLeft() - readonly.leftLoadBufferWidth())

  // ── 带引用缓存的 computed —— 仅在字段值实际变化时返回新对象 ──
  // 避免 Object.is 短路失效导致下游 effect / Vue 订阅在子像素滚动时虚假重跑

  let _cachedViewport: Viewport | null = null
  const cachedViewport = computed<Viewport>(() => {
    const vp = computeViewport(
      readonly.viewWidth(),
      readonly.viewHeight(),
      scrollLeft(),
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

  let _cachedRawVisibleRange: VisibleRange | null = null
  const cachedRawVisibleRange = computed<VisibleRange>(() => {
    const vp = cachedViewport()
    // 分时：与 computeTimeShareXLayout 共用 slot 网格，避免 kWidth/kGap 取整误差截断右缘数据；
    // K 线：仍按 kWidth/kGap 物理像素网格计算
    const vr =
      signalDeps.period$() === 'timeshare'
        ? computeTimeShareVisibleRange({
            scrollLeft: vp.scrollLeft,
            totalWidth: vp.plotWidth,
            dataLength: signalDeps.dataLength$(),
            sessionSlots: signalDeps.sessionSlots$?.() ?? 0,
          })
        : getVisibleRange(
            vp.scrollLeft,
            vp.plotWidth,
            signalDeps.options$().kWidth,
            kGap(),
            signalDeps.dataLength$(),
            vp.dpr,
          )
    if (
      _cachedRawVisibleRange &&
      _cachedRawVisibleRange.start === vr.start &&
      _cachedRawVisibleRange.end === vr.end
    ) {
      return _cachedRawVisibleRange
    }
    _cachedRawVisibleRange = vr
    return vr
  })

  // 可索引可见区间（start>=0）— 绘制 / hit-test / 指标 / ViewportState 的 SSOT
  let _cachedVisibleRange: VisibleRange | null = null
  const cachedVisibleRange = computed<VisibleRange>(() => {
    const clamped = clampVisibleRange(cachedRawVisibleRange())
    if (
      _cachedVisibleRange &&
      _cachedVisibleRange.start === clamped.start &&
      _cachedVisibleRange.end === clamped.end
    ) {
      return _cachedVisibleRange
    }
    _cachedVisibleRange = clamped
    return clamped
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
      kGap: kGap(),
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
   * 写入请求 scrollLeft；与当前值相等时跳过，避免 pan 重复事件空通知。
   */
  const setRequestedScrollLeft = (value: number): void => {
    const normalized = Number.isFinite(value) ? value : 0
    const clamped = Math.max(0, Math.min(normalized, maxScrollLeft.peek()))
    if (signals.requestedScrollLeft.peek() === clamped) return
    signals.requestedScrollLeft.set(clamped)
  }

  const syncFromDomScroll = () => {
    const container = _getDom().container
    if (container) {
      setRequestedScrollLeft(container.scrollLeft)
    }
  }

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
      const derivedContentWidth = contentWidth()
      const derivedScrollLeft = scrollLeft()
      const dom = _getDom()
      if (dom.scrollContent) dom.scrollContent.style.width = `${derivedContentWidth}px`
      if (dom.container) dom.container.scrollLeft = derivedScrollLeft
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
    contentWidth,
    maxScrollLeft,
    scrollLeft,
    scrollLeftLogical,
    kGap,
    viewport: cachedViewport,
    /** raw：含左右扩窗，start 可能为 -1（增量加载左缘检测） */
    rawVisibleRange: cachedRawVisibleRange,
    /** clamped：start>=0，绘制 / hit-test / 指标 / ViewportState 的 SSOT */
    visibleRange: cachedVisibleRange,
    viewportState: cachedViewportState,
  }

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
        setRequestedScrollLeft(v)
      },

      /**
       * 从 DOM 容器的 scrollLeft 同步状态。
       *
       * @remarks 在外部滚动事件中调用，使 signal 与 DOM 保持一致。
       */
      syncFromDomScroll() {
        syncFromDomScroll()
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
        const w = Number.isFinite(width) ? Math.max(0, width) : 0
        const h = Number.isFinite(height) ? Math.max(0, height) : 0
        const d = Number.isFinite(dpr) ? dpr : 1
        batch(() => {
          if (signals.requestedScrollLeft.peek() === 0 && w > 0) {
            signals.requestedScrollLeft.set(w)
          }
          signals.viewWidth.set(w)
          signals.viewHeight.set(h)
          signals.preciseDpr.set(d)
        })
      },

      /**
       * 初始化视口状态。
       *
       * @remarks 从 DOM 容器读取首帧尺寸与 scrollLeft，并挂载 canvas 尺寸同步 effect。
       * 重复调用安全（仅首次生效）。
       */
      init() {
        if (signals.initialized.peek()) return
        if (!_domDeps) return
        const container = _getDom().container
        if (!container) return
        signals.initialized.set(true)
        // 首帧尺寸写入 kernel，避免 paint 路径读 DOM fallback
        const w = Math.max(0, Math.round(container.clientWidth))
        const h = Math.max(0, Math.round(container.clientHeight))
        batch(() => {
          if (w > 0 && h > 0) {
            signals.viewWidth.set(w)
            signals.viewHeight.set(h)
          }
          // 与 resize 一致：首帧 scrollLeft 为 0 时落到 viewWidth
          if (container.scrollLeft === 0 && w > 0) {
            signals.requestedScrollLeft.set(w)
          } else {
            setRequestedScrollLeft(container.scrollLeft)
          }
        })
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
      batch(() => {
        signals.initialized.set(false)
        signals.preciseDpr.set(0)
        signals.viewWidth.set(0)
        signals.viewHeight.set(0)
        signals.requestedScrollLeft.set(0)
      })
    },
  }
}

export type ViewportStateModule = ReturnType<typeof createViewportState>
