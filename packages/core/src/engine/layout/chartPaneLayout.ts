import type { PaneRole } from '../../foundation/plugin/index'
import type { ChartDom, PaneSpec, Viewport } from '../chartTypes'
import { PaneRenderer } from '../paneRenderer'
import type { ScaleType } from '../utils/tickPosition'
import type { PaneStateModule } from '../state/paneState'
import type { ViewportStateModule } from '../state/viewportState'

import { Pane, UpdateLevel } from './pane'
import { normalizeVisiblePaneRatios as pureNormalizeVisiblePaneRatios } from './paneRatioMath'

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
  setKnownPaneIds: (ids: string[]) => void
  notifyPaneResize: (paneId: string, pane: Pane) => void
  scheduleDraw: (level?: UpdateLevel) => void
  /** pane ratios / specs / scaleTypes SSOT */
  pane: PaneStateModule
  /** commitLayout 写入 kernel 后的副作用（如 ensurePaneScaleTypes） */
  afterCommitLayout?: () => void
}

/**
 * Pane DOM / PaneRenderer 投影器 + 布局算法。
 *
 * SSOT: kernel.pane（paneRatios / paneSpecs）。
 * 本地 _internalPaneRatios / _paneSpecs 仅是算法工作副本：
 * - 入站: projectState(kernel snapshot)
 * - 出站: 每次突变结束必须 commitLayout() → kernel
 * projectState 必须 layoutPanes({ commit: false })，禁止回写抖动。
 * 禁止在未 commit 的中间态对外暴露为业务真相。
 */
export class ChartPaneLayout {
  private deps: PaneLayoutDependencies
  private paneRenderers: PaneRenderer[] = []
  private _internalPaneRatios: Map<string, number> = new Map()
  private _paneSpecs: PaneSpec[]

  constructor(initialPaneSpecs: PaneSpec[], deps: PaneLayoutDependencies) {
    this.deps = deps
    this._paneSpecs = initialPaneSpecs.map((s) => ({ ...s }))
    this.syncRatiosFromKernel()
    for (const spec of this._paneSpecs) {
      if (!this._internalPaneRatios.has(spec.id)) {
        this._internalPaneRatios.set(spec.id, spec.ratio ?? 1)
      }
    }
    this.normalizeVisiblePaneRatios(this._paneSpecs)
    this.initPanes()
  }

  getPaneRenderers(): PaneRenderer[] {
    return this.paneRenderers
  }

  /**
   * 公共读：specs 结构来自工作副本定义，ratio 字段取自 kernel（不写工作副本）。
   */
  getPaneSpecs(): PaneSpec[] {
    const kernelRatios = this.deps.pane.readonly.paneRatios.peek()
    return this._paneSpecs.map((spec) => ({
      ...spec,
      ratio: kernelRatios[spec.id] ?? spec.ratio,
      ...(spec.capabilities ? { capabilities: { ...spec.capabilities } } : {}),
    }))
  }

  /**
   * 公共读：直接返回 kernel paneRatios 副本，不触碰算法工作副本。
   */
  getInternalPaneRatios(): Map<string, number> {
    return new Map(Object.entries(this.deps.pane.readonly.paneRatios.peek()))
  }

  private syncRatiosFromKernel(): void {
    const kernelRatios = this.deps.pane.readonly.paneRatios.peek()
    this._internalPaneRatios = new Map(Object.entries(kernelRatios))
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

  private initPanes() {
    const kernelScaleTypes = this.deps.pane.readonly.paneScaleTypes.peek()
    const prevScaleTypes = new Map<string, ScaleType>()
    for (const r of this.paneRenderers) {
      prevScaleTypes.set(r.getPane().id, r.getPane().yAxis.getScaleType())
    }

    this.paneRenderers = this._paneSpecs.map((spec, index) => {
      const pane = new Pane(spec.id, {
        role: this.resolvePaneRole(spec, index),
        capabilities: spec.capabilities,
      })

      // 优先 kernel SSOT，其次重建前 runtime，最后 linear
      const scaleType =
        kernelScaleTypes.get(spec.id) ?? prevScaleTypes.get(spec.id) ?? 'linear'
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
      mainCanvas.style.zIndex = '0'

      overlayCanvas.id = `${spec.id}-overlay`
      overlayCanvas.className = 'overlay-canvas'
      overlayCanvas.style.position = 'absolute'
      overlayCanvas.style.left = '0'
      overlayCanvas.style.top = '0'
      overlayCanvas.style.pointerEvents = 'none'
      overlayCanvas.style.backgroundColor = 'transparent'
      overlayCanvas.style.zIndex = '2'

      const leftYAxisCanvas = this.createAxisCanvas(spec, 'left', 'base')
      const leftYAxisOverlayCanvas = this.createAxisCanvas(spec, 'left', 'overlay')

      const renderer = new PaneRenderer(
        {
          mainCanvas,
          overlayCanvas,
          yAxisCanvas,
          yAxisOverlayCanvas,
          leftYAxisCanvas,
          leftYAxisOverlayCanvas,
        },
        pane,
        {
          rightAxisWidth: this.deps.getOption().rightAxisWidth,
          leftAxisWidth: this.deps.getOption().leftAxisWidth ?? 0,
          yPaddingPx: this.deps.getOption().yPaddingPx,
          priceLabelWidth: this.deps.getOption().priceLabelWidth,
        },
      )

      return renderer
    })

    const dom = this.deps.getDom()
    const canvasLayer = dom.canvasLayer
    const rightAxisLayer = dom.rightAxisLayer
    const leftAxisLayer = dom.leftAxisLayer
    if (canvasLayer) {
      // 保留 chart 级 WebGPU scene canvas（M2 hybrid DOM）
      const existingCanvases = canvasLayer.querySelectorAll(
        'canvas:not(.x-axis-canvas):not(.gpu-scene-canvas)',
      )
      existingCanvases.forEach((canvas) => canvas.remove())
    }
    if (rightAxisLayer) {
      const existingAxisCanvases = rightAxisLayer.querySelectorAll(
        'canvas.right-axis, canvas.right-axis-overlay',
      )
      existingAxisCanvases.forEach((canvas) => canvas.remove())
    }
    if (leftAxisLayer) {
      const existingLeftAxisCanvases = leftAxisLayer.querySelectorAll(
        'canvas.left-axis, canvas.left-axis-overlay',
      )
      existingLeftAxisCanvases.forEach((canvas) => canvas.remove())
    }

    this.paneRenderers.forEach((renderer) => {
      const domEls = renderer.getDom()
      canvasLayer.appendChild(domEls.mainCanvas)
      canvasLayer.appendChild(domEls.overlayCanvas)
      rightAxisLayer.appendChild(domEls.yAxisCanvas)
      rightAxisLayer.appendChild(domEls.yAxisOverlayCanvas)
      if (leftAxisLayer && domEls.leftYAxisCanvas) {
        leftAxisLayer.appendChild(domEls.leftYAxisCanvas)
        if (domEls.leftYAxisOverlayCanvas) {
          leftAxisLayer.appendChild(domEls.leftYAxisOverlayCanvas)
        }
      }
    })

    this.deps.setKnownPaneIds(this.paneRenderers.map((renderer) => renderer.getPane().id))

    this._paneSpecs = this._paneSpecs.map((spec, index) => ({
      ...spec,
      role: this.paneRenderers[index]?.getPane().role ?? spec.role,
    }))
  }

  private syncPaneRatiosFromSpecs(specs: PaneSpec[]): void {
    const next = new Map<string, number>()
    for (const spec of specs) {
      const prev = this._internalPaneRatios.get(spec.id)
      const incoming = Number.isFinite(spec.ratio) ? spec.ratio : 0
      const ratio = prev !== undefined ? prev : incoming > 0 ? incoming : 1
      next.set(spec.id, ratio)
    }
    this._internalPaneRatios = next
    this.normalizeVisiblePaneRatios(specs)
    this.syncPaneRatiosToSpecs()
  }

  private syncPaneRatiosToSpecs(): void {
    const visible = this._paneSpecs.filter((p) => p.visible !== false)
    const visibleSum = visible.reduce(
      (s, p) => s + (this._internalPaneRatios.get(p.id) ?? p.ratio ?? 0),
      0,
    )
    const safeVisibleSum = visibleSum > 0 ? visibleSum : 1

    this._paneSpecs = this._paneSpecs.map((spec) => {
      const ratio = this._internalPaneRatios.get(spec.id) ?? spec.ratio ?? 0
      if (spec.visible === false) {
        return { ...spec, ratio }
      }
      return { ...spec, ratio: ratio / safeVisibleSum }
    })
  }

  private normalizeVisiblePaneRatios(specs: PaneSpec[]): void {
    const asRecord: Record<string, number> = {}
    this._internalPaneRatios.forEach((ratio, id) => {
      asRecord[id] = ratio
    })
    const normalized = pureNormalizeVisiblePaneRatios(specs, asRecord)
    this._internalPaneRatios = new Map(Object.entries(normalized))
  }

  private getPaneMinHeight(spec: PaneSpec, plotHeight: number): number {
    const fallback = this.deps.getOption().defaultPaneMinHeightPx ?? 120
    const raw = spec.minHeightPx ?? fallback
    return Math.max(1, Math.min(Math.round(raw), Math.max(1, plotHeight)))
  }

  private computePaneHeightsByRatio(visibleSpecs: PaneSpec[], availableH: number): number[] {
    if (visibleSpecs.length === 0) return []

    const ratios = visibleSpecs.map(
      (spec) => this._internalPaneRatios.get(spec.id) ?? spec.ratio ?? 0,
    )
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

  layoutPanes(options?: { commit?: boolean }) {
    this.syncRatiosFromKernel()

    const vp = this.peekViewport()
    if (!vp) return

    const visibleSpecs = this._paneSpecs.filter((p) => p.visible !== false)
    if (visibleSpecs.length === 0) return

    const opt = this.deps.getOption()
    const gap = Math.max(0, opt.paneGap ?? 0)
    let y = 0

    const totalGaps = gap * Math.max(0, visibleSpecs.length - 1)
    const availableH = Math.max(1, vp.plotHeight - totalGaps)

    this.normalizeVisiblePaneRatios(visibleSpecs)
    const paneHeights = this.computePaneHeightsByRatio(visibleSpecs, availableH)

    for (let i = 0; i < visibleSpecs.length; i++) {
      const spec = visibleSpecs[i]
      if (!spec) continue

      const renderer = this.paneRenderers.find((r) => r.getPane().id === spec.id)
      if (!renderer) continue

      const pane = renderer.getPane()
      const h = paneHeights[i] ?? 1

      pane.setLayout(y, h)
      pane.setPadding(opt.yPaddingPx, opt.yPaddingPx)

      renderer.resize(vp.plotWidth, h, vp.dpr)
      this.deps.notifyPaneResize(pane.id, pane)
      const domEls = renderer.getDom()
      domEls.mainCanvas.style.top = `${y}px`
      domEls.overlayCanvas.style.top = `${y}px`
      domEls.yAxisCanvas.style.top = `${y}px`
      domEls.yAxisCanvas.style.left = '0px'
      domEls.yAxisOverlayCanvas.style.top = `${y}px`
      domEls.yAxisOverlayCanvas.style.left = '0px'
      if (domEls.leftYAxisCanvas) {
        domEls.leftYAxisCanvas.style.top = `${y}px`
        domEls.leftYAxisCanvas.style.left = '0px'
      }
      if (domEls.leftYAxisOverlayCanvas) {
        domEls.leftYAxisOverlayCanvas.style.top = `${y}px`
        domEls.leftYAxisOverlayCanvas.style.left = '0px'
      }

      y += h + gap
    }

    const finalAvailable = Math.max(1, availableH)
    for (const spec of visibleSpecs) {
      const renderer = this.paneRenderers.find((r) => r.getPane().id === spec.id)
      if (!renderer) continue
      const h = renderer.getPane().height
      this._internalPaneRatios.set(spec.id, h / finalAvailable)
    }
    this.normalizeVisiblePaneRatios(visibleSpecs)
    this.syncPaneRatiosToSpecs()
    if (options?.commit !== false) this.commitLayout()
  }

  /** 将 kernel pane snapshot 单向投影到 DOM/renderer，不反向写 state。 */
  projectState(panes: ReadonlyArray<PaneSpec>, ratios: Readonly<Record<string, number>>): void {
    const definitionsChanged =
      panes.length !== this._paneSpecs.length ||
      panes.some((pane, index) => {
        const current = this._paneSpecs[index]
        return (
          !current ||
          pane.id !== current.id ||
          pane.visible !== current.visible ||
          pane.role !== current.role ||
          pane.minHeightPx !== current.minHeightPx ||
          JSON.stringify(pane.capabilities ?? null) !== JSON.stringify(current.capabilities ?? null)
        )
      })

    this._paneSpecs = panes.map((pane) => ({
      ...pane,
      ...(pane.capabilities ? { capabilities: { ...pane.capabilities } } : {}),
    }))
    this._internalPaneRatios = new Map(Object.entries(ratios))
    if (definitionsChanged) this.initPanes()
    this.layoutPanes({ commit: false })
  }

  /**
   * 公共读：用 kernel ratios + 本地 specs 定义组装快照，不写工作副本。
   * commitLayout 走 buildLayoutSpecsFromWorkingCopy，避免公共读污染算法中间态。
   */
  getPaneLayoutSpecs(): PaneSpec[] {
    return this.buildLayoutSpecs(this.deps.pane.readonly.paneRatios.peek())
  }

  /** 仅算法/commit 使用：读当前工作副本 ratios，不读 kernel */
  private buildLayoutSpecsFromWorkingCopy(): PaneSpec[] {
    const ratios: Record<string, number> = {}
    this._internalPaneRatios.forEach((ratio, id) => {
      ratios[id] = ratio
    })
    return this.buildLayoutSpecs(ratios)
  }

  private buildLayoutSpecs(ratios: Readonly<Record<string, number>>): PaneSpec[] {
    const visible = this._paneSpecs.filter((p) => p.visible !== false)
    const sum = visible.reduce((s, p) => s + (ratios[p.id] ?? p.ratio ?? 0), 0)
    const safeSum = sum > 0 ? sum : 1
    return this._paneSpecs.map((spec) => {
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

  private commitLayout(): void {
    const ratios: Record<string, number> = {}
    this._internalPaneRatios.forEach((ratio, id) => {
      ratios[id] = ratio
    })
    this.deps.pane.actions.commitLayout(ratios, this.buildLayoutSpecsFromWorkingCopy())
    this.deps.afterCommitLayout?.()
  }

  hasPane(paneId: string): boolean {
    return this._paneSpecs.some((spec) => spec.id === paneId)
  }

  resizePaneBoundary(upperPaneId: string, deltaY: number): boolean {
    if (!Number.isFinite(deltaY) || deltaY === 0) return false
    const vp = this.peekViewport()
    if (!vp) return false

    this.syncRatiosFromKernel()

    const visibleSpecs = this._paneSpecs.filter((p) => p.visible !== false)
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

    for (const spec of visibleSpecs) {
      const h = heights.get(spec.id) ?? 0
      this._internalPaneRatios.set(spec.id, h / availableH)
    }

    this.commitLayout()

    this.layoutPanes()
    this.deps.scheduleDraw()
    return true
  }

  destroy(): void {
    this.paneRenderers.forEach((r) => r.destroy())
    this.paneRenderers = []
    this._internalPaneRatios.clear()
    this._paneSpecs = []
  }
}
