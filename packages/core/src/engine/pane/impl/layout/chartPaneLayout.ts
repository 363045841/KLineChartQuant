/** Pane 表面布局：DOM 层序复用 Scene 合成目标契约。 */
import { SCENE_TARGET_Z } from '@/rendering/scene/types.js'
import { GENERIC_ERROR_CODES, KLineChartError } from '../../../../errors.js'
import type { PaneRole } from '../../../../foundation/plugin/index.js'
import { ScaleType } from '../../../../foundation/types/scaleType.js'
import type { ChartDom, Viewport } from '../../../chart/index.js'
import type { PaneStateModule } from '../../../state/paneState.js'
import type { ViewportStateModule } from '../../../state/viewportState.js'
import {
  DEFAULT_PRICE_LABEL_WIDTH,
  MAIN_PANE_ID,
  type PaneBoundaryResizeSession,
  type PaneSpec,
  type PaneSurfaceFactory,
} from '../../types.js'
import { PaneRenderer } from '../paneRenderer.js'

import { Pane, UpdateLevel } from './pane.js'
import { computePaneHeights, fitPaneMinimums } from './paneGeometry.js'

export interface PaneLayoutDependencies {
  getDom: () => ChartDom
  getOption: () => {
    rightAxisWidth: number
    leftAxisWidth: number
    yPaddingPx: number
    priceLabelWidth?: number
    paneGap?: number
    defaultPaneMinHeightPx?: number
  }
  /** scroll / plot 几何 SSOT */
  viewport: ViewportStateModule
  scheduleDraw: (level?: UpdateLevel) => void
  /** pane ratios / specs / scaleTypes SSOT */
  pane: PaneStateModule
  /** commitLayout 写入 kernel 后的副作用（如 ensurePaneScaleTypes） */
  afterCommitLayout?: () => void
}

/**
 * Pane DOM / PaneRenderer 投影器 + 布局算法。
 *
 * 配置只来自 kernel.pane；本地规格与比例仅供像素布局计算。
 * 容器变化和内容加载均为单向投影，只有用户拖动边界才提交新权重。
 */
export class ChartPaneLayout {
  private deps: PaneLayoutDependencies
  private paneRenderers: PaneRenderer[] = []
  /** 左轴是否可见；只有可见时主图 pane 才分配左轴表面。 */
  private leftAxisVisible = false
  /** 配置只从 Kernel 读取，布局模块不持有规格或比例的工作副本。 */
  private get paneSpecs(): ReadonlyArray<PaneSpec> {
    return this.deps.pane.readonly.paneSpecs.peek()
  }

  constructor(deps: PaneLayoutDependencies) {
    this.deps = deps
    this.initPanes()
  }

  getPaneRenderers(): PaneRenderer[] {
    return this.paneRenderers
  }

  /** 应用框架派生的轴列表；Pane 只消费轴身份，不反向解释指标能力。 */
  setPaneAxes(axesByPane: ReadonlyMap<string, ReadonlyArray<{ readonly axisId: string }>>): void {
    for (const renderer of this.paneRenderers) {
      const pane = renderer.getPane()
      const axes = axesByPane.get(pane.id)
      if (!axes) continue
      pane.setAxes(axes.map((axis) => axis.axisId))
    }
  }

  private resolvePaneRole(spec: PaneSpec): PaneRole {
    if (spec.role) return spec.role
    return spec.id === MAIN_PANE_ID ? 'price' : 'indicator'
  }

  private createAxisCanvas(
    spec: PaneSpec,
    side: 'left' | 'right',
    kind: 'base' | 'overlay' = 'base',
  ): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    const isRight = side === 'right'
    const isOverlay = kind === 'overlay'
    canvas.id = `${spec.id}-${side}Axis${isOverlay ? 'Overlay' : ''}`
    canvas.className = isRight
      ? isOverlay
        ? 'right-axis-overlay'
        : 'right-axis'
      : isOverlay
        ? 'left-axis-overlay'
        : 'left-axis'
    canvas.style.position = 'absolute'
    canvas.style.left = '0'
    if (isOverlay) {
      canvas.style.pointerEvents = 'none'
      canvas.style.backgroundColor = 'transparent'
      canvas.style.zIndex = '1'
    } else {
      canvas.style.zIndex = '0'
    }
    return canvas
  }

  /**
   * 按需表面工厂：正式图元表面插在同 pane overlay 之下（同 z-index 按 DOM 顺序叠放），
   * 左轴表面仅主图 pane 可创建，挂到左轴宿主（缺省回退到绘图层）。
   */
  private createSurfaceFactory(
    spec: PaneSpec,
    mainCanvas: HTMLCanvasElement,
    overlayCanvas: HTMLCanvasElement,
    isMain: boolean,
  ): PaneSurfaceFactory {
    const leftAxisHost = this.deps.getDom().leftAxisLayer
    return {
      leftAxisHostMeasurable: leftAxisHost !== undefined,
      createMainGpuCanvas: () => {
        // GPU 直接呈现主图带几何；2D 主画布在其上承载文字与 ctx 图层。
        const gpuCanvas = document.createElement('canvas')
        gpuCanvas.id = `${spec.id}-main-gpu`
        gpuCanvas.className = 'main-canvas-gpu'
        gpuCanvas.style.position = 'absolute'
        gpuCanvas.style.left = '0'
        gpuCanvas.style.top = '0'
        gpuCanvas.style.pointerEvents = 'none'
        gpuCanvas.style.zIndex = String(SCENE_TARGET_Z.main)
        mainCanvas.before(gpuCanvas)
        return gpuCanvas
      },
      createDrawingCanvas: () => {
        // 正式图元与动态覆盖分开保存像素，同 z-index 按 DOM 顺序叠放在行情之上。
        const drawingCanvas = document.createElement('canvas')
        drawingCanvas.id = `${spec.id}-drawing`
        drawingCanvas.className = 'drawing-canvas'
        drawingCanvas.style.cssText = overlayCanvas.style.cssText
        drawingCanvas.style.zIndex = String(SCENE_TARGET_Z.drawing)
        overlayCanvas.before(drawingCanvas)
        return drawingCanvas
      },
      createLeftAxisCanvases: () => {
        if (!isMain) {
          throw new KLineChartError(
            GENERIC_ERROR_CODES.INVALID_STATE,
            `[ChartPaneLayout] pane '${spec.id}' has no left price axis`,
          )
        }
        const base = this.createAxisCanvas(spec, 'left')
        const overlay = this.createAxisCanvas(spec, 'left', 'overlay')
        const host = leftAxisHost ?? this.deps.getDom().canvasLayer
        for (const canvas of [base, overlay]) {
          canvas.style.pointerEvents = 'none'
          canvas.style.zIndex = '3'
          host.appendChild(canvas)
        }
        return { base, overlay }
      },
    }
  }

  private initPanes() {
    const kernelScaleTypes = this.deps.pane.readonly.paneScaleTypes.peek()
    const remaining = new Map(
      this.paneRenderers.map((renderer) => [renderer.getPane().id, renderer]),
    )
    this.paneRenderers = this.paneSpecs.map((spec) => {
      const existing = remaining.get(spec.id)
      remaining.delete(spec.id)
      const role = this.resolvePaneRole(spec)
      if (existing) {
        const current = existing.getPane()
        const expected = new Pane(spec.id, { role, capabilities: spec.capabilities })
        if (
          current.role === role &&
          JSON.stringify(current.capabilities) === JSON.stringify(expected.capabilities)
        ) {
          return existing
        }
        existing.destroy()
      }
      const pane = new Pane(spec.id, {
        role,
        capabilities: spec.capabilities,
      })

      const scaleType = kernelScaleTypes.get(spec.id) ?? ScaleType.Linear
      pane.yAxis.setScaleType(scaleType)

      const mainCanvas = document.createElement('canvas')
      const overlayCanvas = document.createElement('canvas')
      const yAxisCanvas = this.createAxisCanvas(spec, 'right', 'base')
      const yAxisOverlayCanvas = this.createAxisCanvas(spec, 'right', 'overlay')

      const isMain = pane.role === 'price'

      mainCanvas.id = `${spec.id}-main`
      mainCanvas.className = isMain ? 'main-canvas main' : 'main-canvas sub'
      mainCanvas.style.position = 'absolute'
      mainCanvas.style.left = '0'
      mainCanvas.style.top = '0'
      mainCanvas.style.zIndex = String(SCENE_TARGET_Z.main)

      overlayCanvas.id = `${spec.id}-overlay`
      overlayCanvas.className = 'overlay-canvas'
      overlayCanvas.style.position = 'absolute'
      overlayCanvas.style.left = '0'
      overlayCanvas.style.top = '0'
      overlayCanvas.style.pointerEvents = 'none'
      overlayCanvas.style.backgroundColor = 'transparent'
      overlayCanvas.style.zIndex = String(SCENE_TARGET_Z.overlay)

      return new PaneRenderer(
        { mainCanvas, overlayCanvas, yAxisCanvas, yAxisOverlayCanvas },
        pane,
        {
          rightAxisWidth: this.deps.getOption().rightAxisWidth,
          leftAxisWidth: this.deps.getOption().leftAxisWidth ?? 0,
          yPaddingPx: this.deps.getOption().yPaddingPx,
          priceLabelWidth: this.deps.getOption().priceLabelWidth,
        },
        this.createSurfaceFactory(spec, mainCanvas, overlayCanvas, isMain),
      )
    })
    for (const renderer of remaining.values()) renderer.destroy()

    const dom = this.deps.getDom()
    const canvasLayer = dom.canvasLayer
    const rightAxisLayer = dom.rightAxisLayer
    // 仅在身份或顺序改变时移动节点，纯比例与显隐更新不产生 DOM 重挂载。
    const order = (host: HTMLElement, canvases: HTMLCanvasElement[]) => {
      let previous: HTMLCanvasElement | undefined
      for (const canvas of canvases) {
        if (canvas.parentElement !== host || (previous && previous.nextElementSibling !== canvas)) {
          if (previous) previous.after(canvas)
          else host.appendChild(canvas)
        }
        previous = canvas
      }
    }
    order(
      canvasLayer,
      this.paneRenderers.flatMap((renderer) => {
        const dom = renderer.getDom()
        return [dom.mainGpuCanvas, dom.mainCanvas, dom.drawingCanvas, dom.overlayCanvas].filter(
          (canvas): canvas is HTMLCanvasElement => canvas !== undefined,
        )
      }),
    )
    order(
      rightAxisLayer,
      this.paneRenderers.flatMap((renderer) => {
        const dom = renderer.getDom()
        return [dom.yAxisCanvas, dom.yAxisOverlayCanvas]
      }),
    )
  }

  private getPaneMinHeight(spec: PaneSpec, plotHeight: number): number {
    const fallback = this.deps.getOption().defaultPaneMinHeightPx ?? 120
    const raw = spec.minHeightPx ?? fallback
    return Math.max(1, Math.min(Math.round(raw), Math.max(1, plotHeight)))
  }

  private computePaneHeightsByRatio(visibleSpecs: PaneSpec[], availableH: number): number[] {
    return computePaneHeights(
      visibleSpecs.map((spec) => spec.ratio),
      visibleSpecs.map((spec) => this.getPaneMinHeight(spec, availableH)),
      availableH,
    )
  }

  /** viewWidth 为 0 表示尚未完成首帧尺寸 */
  private peekViewport(): Viewport | null {
    if (this.deps.viewport.readonly.viewWidth.peek() === 0) return null
    return this.deps.viewport.readonly.viewport.peek()
  }

  layoutPanes() {
    const vp = this.peekViewport()
    if (!vp) return

    const visibleSpecs = this.paneSpecs.filter((p) => p.visible !== false)
    // 隐藏 pane 不参与布局，也不保留后备存储。
    for (const spec of this.paneSpecs) {
      if (spec.visible !== false) continue
      const renderer = this.paneRenderers.find((r) => r.getPane().id === spec.id)
      renderer?.getPane().setLayout(vp.plotHeight, 0)
      renderer?.setVisible(false)
    }

    const opt = this.deps.getOption()
    const gap = this.getPaneGap(visibleSpecs.length, vp.plotHeight)
    let y = 0

    const totalGaps = gap * Math.max(0, visibleSpecs.length - 1)
    const availableH = Math.max(0, Math.floor(vp.plotHeight - totalGaps))

    const paneHeights = this.computePaneHeightsByRatio(visibleSpecs, availableH)

    for (let i = 0; i < visibleSpecs.length; i++) {
      const spec = visibleSpecs[i]
      if (!spec) continue

      const renderer = this.paneRenderers.find((r) => r.getPane().id === spec.id)
      if (!renderer) continue

      const pane = renderer.getPane()
      const h = paneHeights[i] ?? 1

      pane.setLayout(y, h)
      // 图例以半透明背景叠加显示，价格坐标只保留配置的视觉留白。
      pane.setContentInsets(opt.yPaddingPx, opt.yPaddingPx)

      renderer.resize(vp.plotWidth, h, vp.dpr, y)
      this.syncLeftAxis(renderer)
      const domEls = renderer.getDom()
      domEls.yAxisCanvas.style.left = '0px'
      domEls.yAxisOverlayCanvas.style.left = '0px'

      y += h + gap
    }
    const widths = new Map(
      this.deps.pane.readonly.paneGeometry.peek().map((pane) => [pane.id, pane.primaryAxisWidth]),
    )
    this.deps.pane.actions.setPaneGeometry(
      visibleSpecs.flatMap((spec) => {
        const pane = this.paneRenderers
          .find((renderer) => renderer.getPane().id === spec.id)
          ?.getPane()
        return pane && pane.height > 0
          ? [
              {
                id: pane.id,
                top: pane.top,
                height: pane.height,
                primaryAxisWidth:
                  widths.get(pane.id) ??
                  opt.rightAxisWidth + (opt.priceLabelWidth ?? DEFAULT_PRICE_LABEL_WIDTH),
              },
            ]
          : []
      }),
    )
  }

  /** 间隔受绘图区预算限制，极小容器也不会仅因 gap 就溢出。 */
  private getPaneGap(count: number, height: number): number {
    return count < 2
      ? 0
      : Math.min(Math.max(0, this.deps.getOption().paneGap ?? 0), height / (count - 1))
  }

  /** 轴宽测量直接发布到只读几何，不再通过 CSS 变量传递给宿主。 */
  setPrimaryAxisWidths(widths: Readonly<Record<string, number>>): void {
    this.deps.pane.actions.setPaneGeometry(
      this.deps.pane.readonly.paneGeometry.peek().map((geometry) => {
        const pane = this.paneRenderers
          .find((renderer) => renderer.getPane().id === geometry.id)!
          .getPane()
        return { ...geometry, primaryAxisWidth: widths[pane.axes[0]!.axisId]! }
      }),
    )
  }

  /** 将 kernel pane snapshot 单向投影到 DOM/renderer，不反向写 state。 */
  projectState(): void {
    this.initPanes()
    this.layoutPanes()
  }

  /** 公共配置读取只复制 Kernel 规格，不从运行时 Pane 反推角色或比例。 */
  getPaneLayoutSpecs(): PaneSpec[] {
    return this.paneSpecs.map((spec) => ({ ...spec }))
  }

  /** 同步左轴可见性：可见时为主图 pane 创建左轴表面，隐藏时释放其后备存储。 */
  setLeftAxisVisible(visible: boolean): void {
    this.leftAxisVisible = visible
    for (const renderer of this.paneRenderers) this.syncLeftAxis(renderer)
  }

  private syncLeftAxis(renderer: PaneRenderer): void {
    renderer.setLeftAxisVisible(this.leftAxisVisible && renderer.getPane().role === 'price')
  }

  hasPane(paneId: string): boolean {
    return this.paneSpecs.some((spec) => spec.id === paneId)
  }

  resizePaneBoundary(upperPaneId: string, deltaY: number): boolean {
    return this.beginBoundaryResize(upperPaneId)?.resize(deltaY) ?? false
  }

  /** 捕获相邻 pane 的起始几何；总位移夹在两侧最小高度之间，不向其它 pane 借空间。 */
  beginBoundaryResize(upperPaneId: string): PaneBoundaryResizeSession | null {
    const vp = this.peekViewport()
    if (!vp) return null
    const initialSpecs = this.paneSpecs
    const visibleSpecs = this.paneSpecs.filter((p) => p.visible !== false)
    const boundaryIndex = visibleSpecs.findIndex((p) => p.id === upperPaneId)
    if (boundaryIndex < 0 || boundaryIndex >= visibleSpecs.length - 1) return null
    const gap = this.getPaneGap(visibleSpecs.length, vp.plotHeight)
    const totalGaps = gap * Math.max(0, visibleSpecs.length - 1)
    const availableH = Math.max(0, Math.floor(vp.plotHeight - totalGaps))
    if (availableH <= 0) return null
    const heights = visibleSpecs.map(
      (spec) =>
        this.paneRenderers.find((renderer) => renderer.getPane().id === spec.id)!.getPane().height,
    )
    if (heights[boundaryIndex]! <= 0 || heights[boundaryIndex + 1]! <= 0) return null
    const minimums = visibleSpecs.map((spec) => this.getPaneMinHeight(spec, availableH))
    const mins = fitPaneMinimums(minimums, availableH)
    const minimumDelta = Math.min(0, Math.ceil(mins[boundaryIndex]!) - heights[boundaryIndex]!)
    const maximumDelta = Math.max(
      0,
      heights[boundaryIndex + 1]! - Math.ceil(mins[boundaryIndex + 1]!),
    )
    let expectedSpecs = initialSpecs
    let previousDelta = 0
    return {
      resize: (totalDeltaY) => {
        if (
          !Number.isFinite(totalDeltaY) ||
          this.paneSpecs !== expectedSpecs ||
          this.peekViewport()?.plotHeight !== vp.plotHeight ||
          this.getPaneGap(visibleSpecs.length, vp.plotHeight) !== gap ||
          visibleSpecs.some(
            (spec, index) => this.getPaneMinHeight(spec, availableH) !== minimums[index],
          )
        )
          return false
        const delta = Math.max(minimumDelta, Math.min(maximumDelta, Math.round(totalDeltaY)))
        if (delta === previousDelta) return false
        const nextHeights = [...heights]
        nextHeights[boundaryIndex] = heights[boundaryIndex]! + delta
        nextHeights[boundaryIndex + 1] = heights[boundaryIndex + 1]! - delta
        const ratios = new Map(
          visibleSpecs.map((spec, index) => [spec.id, nextHeights[index]! / availableH]),
        )
        // 回到原点恢复原始权重，不能把最小高度约束下的像素占比永久写成用户配置。
        const nextSpecs =
          delta === 0
            ? initialSpecs
            : initialSpecs.map((spec) =>
                spec.visible === false ? spec : { ...spec, ratio: ratios.get(spec.id)! },
              )
        this.deps.pane.actions.commitLayout(nextSpecs)
        expectedSpecs = this.paneSpecs
        previousDelta = delta
        this.deps.afterCommitLayout?.()
        return true
      },
    }
  }

  destroy(): void {
    this.paneRenderers.forEach((r) => r.destroy())
    this.paneRenderers = []
  }
}
