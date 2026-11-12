/** Pane 表面布局：DOM 层序复用 Scene 合成目标契约。 */
import { SCENE_TARGET_Z } from '@/rendering/scene/types.js'
import { GENERIC_ERROR_CODES, KLineChartError } from '../../../../errors.js'
import type { PaneRole } from '../../../../foundation/plugin/index.js'
import { ScaleType } from '../../../../foundation/types/scaleType.js'
import type { ChartDom, Viewport } from '../../../chart/index.js'
import type { PaneStateModule } from '../../../state/paneState.js'
import type { ViewportStateModule } from '../../../state/viewportState.js'
import type { PaneSpec, PaneSurfaceFactory } from '../../types.js'
import { PaneRenderer } from '../paneRenderer.js'

import { Pane, UpdateLevel } from './pane.js'

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

  private resolvePaneRole(spec: PaneSpec, index: number): PaneRole {
    if (spec.role) return spec.role
    return index === 0 ? 'price' : 'indicator'
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
    this.paneRenderers = this.paneSpecs.map((spec, index) => {
      const existing = remaining.get(spec.id)
      remaining.delete(spec.id)
      const role = this.resolvePaneRole(spec, index)
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
    this.paneRenderers.forEach((renderer) => {
      const domEls = renderer.getDom()
      canvasLayer.appendChild(domEls.mainCanvas)
      canvasLayer.appendChild(domEls.overlayCanvas)
      rightAxisLayer.appendChild(domEls.yAxisCanvas)
      rightAxisLayer.appendChild(domEls.yAxisOverlayCanvas)
    })
  }

  private getPaneMinHeight(spec: PaneSpec, plotHeight: number): number {
    const fallback = this.deps.getOption().defaultPaneMinHeightPx ?? 120
    const raw = spec.minHeightPx ?? fallback
    return Math.max(1, Math.min(Math.round(raw), Math.max(1, plotHeight)))
  }

  private computePaneHeightsByRatio(visibleSpecs: PaneSpec[], availableH: number): number[] {
    if (visibleSpecs.length === 0) return []

    const ratios = visibleSpecs.map((spec) => spec.ratio)
    const ratioSum = ratios.reduce((s, r) => s + (r > 0 ? r : 0), 0)
    const safeRatios =
      ratioSum > 0
        ? ratios.map((r) => (r > 0 ? r : 0) / ratioSum)
        : visibleSpecs.map(() => 1 / visibleSpecs.length)

    const heights = safeRatios.map((r) => Math.max(1, Math.round(availableH * r)))
    const mins = visibleSpecs.map((spec) => this.getPaneMinHeight(spec, availableH))

    for (let i = 0; i < heights.length; i++) {
      heights[i] = Math.max(heights[i]!, Math.min(mins[i]!, availableH))
    }

    let total = heights.reduce((s, h) => s + h, 0)

    if (total > availableH) {
      let overflow = total - availableH
      while (overflow > 0) {
        let shrunk = false
        for (let i = heights.length - 1; i >= 0 && overflow > 0; i--) {
          const minH = Math.max(1, Math.min(mins[i]!, availableH))
          const h = heights[i]!
          if (h > minH) {
            heights[i] = h - 1
            overflow--
            shrunk = true
          }
        }
        if (!shrunk) break
      }
    } else if (total < availableH) {
      heights[heights.length - 1] = (heights[heights.length - 1] ?? 1) + (availableH - total)
    }

    total = heights.reduce((s, h) => s + h, 0)
    if (total !== availableH && heights.length > 0) {
      heights[heights.length - 1] = Math.max(
        1,
        (heights[heights.length - 1] ?? 1) + (availableH - total),
      )
    }

    return heights
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
    if (visibleSpecs.length === 0) return
    // 隐藏 pane 不参与布局，也不保留后备存储。
    for (const spec of this.paneSpecs) {
      if (spec.visible !== false) continue
      this.paneRenderers.find((r) => r.getPane().id === spec.id)?.setVisible(false)
    }

    const opt = this.deps.getOption()
    const gap = Math.max(0, opt.paneGap ?? 0)
    let y = 0

    const totalGaps = gap * Math.max(0, visibleSpecs.length - 1)
    const availableH = Math.max(1, vp.plotHeight - totalGaps)

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
  }

  /** 将 kernel pane snapshot 单向投影到 DOM/renderer，不反向写 state。 */
  projectState(): void {
    this.initPanes()
    this.layoutPanes()
  }

  /**
   * 公共读：用 kernel ratios + 本地 specs 定义组装快照，不写工作副本。
   * commitLayout 走 buildLayoutSpecsFromWorkingCopy，避免公共读污染算法中间态。
   */
  getPaneLayoutSpecs(): PaneSpec[] {
    return this.buildLayoutSpecs(this.deps.pane.readonly.paneRatios.peek())
  }

  private buildLayoutSpecs(ratios: Readonly<Record<string, number>>): PaneSpec[] {
    const visible = this.paneSpecs.filter((p) => p.visible !== false)
    const sum = visible.reduce((s, p) => s + (ratios[p.id] ?? p.ratio ?? 0), 0)
    const safeSum = sum > 0 ? sum : 1
    return this.paneSpecs.map((spec) => {
      const base = ratios[spec.id] ?? spec.ratio ?? 0
      const ratio = spec.visible === false ? base : base / safeSum
      const pane = this.paneRenderers.find((r) => r.getPane().id === spec.id)?.getPane()
      return {
        ...spec,
        ratio,
        role: pane?.role ?? spec.role,
        capabilities: pane ? { ...pane.capabilities } : spec.capabilities,
      }
    })
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
    if (!Number.isFinite(deltaY) || deltaY === 0) return false
    const vp = this.peekViewport()
    if (!vp) return false

    const visibleSpecs = this.paneSpecs.filter((p) => p.visible !== false)
    const boundaryIndex = visibleSpecs.findIndex((p) => p.id === upperPaneId)
    if (boundaryIndex < 0 || boundaryIndex >= visibleSpecs.length - 1) return false

    const upperSpec = visibleSpecs[boundaryIndex]
    const lowerSpec = visibleSpecs[boundaryIndex + 1]
    if (!upperSpec || !lowerSpec) return false

    const heights = new Map<string, number>()
    for (const spec of visibleSpecs) {
      const renderer = this.paneRenderers.find((r) => r.getPane().id === spec.id)
      if (renderer) {
        heights.set(spec.id, renderer.getPane().height)
      }
    }

    const expandIdx = deltaY > 0 ? boundaryIndex : boundaryIndex + 1
    const shrinkIdx = deltaY > 0 ? boundaryIndex + 1 : boundaryIndex
    const expandDir = deltaY > 0 ? -1 : 1
    const shrinkDir = deltaY > 0 ? 1 : -1

    let remaining = Math.abs(deltaY)

    let shrinkCursor = shrinkIdx
    while (remaining > 0 && shrinkCursor >= 0 && shrinkCursor < visibleSpecs.length) {
      const spec = visibleSpecs[shrinkCursor]
      if (!spec) break

      const currentH = heights.get(spec.id) ?? 0
      const minH = this.getPaneMinHeight(spec, vp.plotHeight)
      const canShrink = Math.max(0, currentH - minH)

      if (canShrink > 0) {
        const shrink = Math.min(canShrink, remaining)
        heights.set(spec.id, currentH - shrink)
        remaining -= shrink
      }

      if (remaining > 0) {
        shrinkCursor += shrinkDir
      }
    }

    if (remaining > 0) return false

    const expandSpec = visibleSpecs[expandIdx]
    if (!expandSpec) return false
    const expandCurrentH = heights.get(expandSpec.id) ?? 0
    heights.set(expandSpec.id, expandCurrentH + Math.abs(deltaY))

    const opt = this.deps.getOption()
    const gap = Math.max(0, opt.paneGap ?? 0)
    const totalGaps = gap * Math.max(0, visibleSpecs.length - 1)
    const availableH = Math.max(1, vp.plotHeight - totalGaps)

    const ratios = { ...this.deps.pane.readonly.paneRatios.peek() }
    for (const spec of visibleSpecs) ratios[spec.id] = heights.get(spec.id)! / availableH
    this.deps.pane.actions.commitLayout(ratios, this.buildLayoutSpecs(ratios))
    this.deps.afterCommitLayout?.()

    this.layoutPanes()
    this.deps.scheduleDraw()
    return true
  }

  destroy(): void {
    this.paneRenderers.forEach((r) => r.destroy())
    this.paneRenderers = []
  }
}
