import { Pane, UpdateLevel } from './pane'
import type { PaneRole } from '../../plugin'
import { PaneRenderer } from '../paneRenderer'
import type { SharedWebGLSurface } from '../renderers/webgl/sharedWebGLSurface'
import type { ChartDom, PaneSpec, Viewport } from '../chartTypes'

export interface PaneLayoutDependencies {
  getDom: () => ChartDom
  getOption: () => {
    rightAxisWidth: number
    yPaddingPx: number
    priceLabelWidth?: number
    paneGap?: number
    defaultPaneMinHeightPx?: number
  }
  getViewport: () => Viewport | null
  getSharedWebGLSurface: () => SharedWebGLSurface
  setKnownPaneIds: (ids: string[]) => void
  notifyPaneResize: (paneId: string, pane: Pane) => void
  scheduleDraw: (level?: UpdateLevel) => void
  onLayoutChange: (ratios: Record<string, number>, specs: PaneSpec[]) => void
}

export class ChartPaneLayout {
  private deps: PaneLayoutDependencies
  private paneRenderers: PaneRenderer[] = []
  private _internalPaneRatios: Map<string, number> = new Map()
  private _paneSpecs: PaneSpec[]

  constructor(initialPaneSpecs: PaneSpec[], deps: PaneLayoutDependencies) {
    this.deps = deps
    this._paneSpecs = initialPaneSpecs.map((s) => ({ ...s }))
    this.syncPaneRatiosFromSpecs(this._paneSpecs)
    this.initPanes()
  }

  getPaneRenderers(): PaneRenderer[] {
    return this.paneRenderers
  }

  getPaneSpecs(): PaneSpec[] {
    return this._paneSpecs
  }

  getInternalPaneRatios(): Map<string, number> {
    return this._internalPaneRatios
  }

  setInternalPaneRatio(paneId: string, ratio: number): void {
    this._internalPaneRatios.set(paneId, ratio)
  }

  deleteInternalPaneRatio(paneId: string): void {
    this._internalPaneRatios.delete(paneId)
  }

  private resolvePaneRole(spec: PaneSpec, index: number): PaneRole {
    if (spec.role) return spec.role
    return index === 0 ? 'price' : 'indicator'
  }

  private initPanes() {
    this.paneRenderers = this._paneSpecs.map((spec, index) => {
      const pane = new Pane(spec.id, {
        role: this.resolvePaneRole(spec, index),
        capabilities: spec.capabilities,
      })

      const mainCanvas = document.createElement('canvas')
      const overlayCanvas = document.createElement('canvas')
      const yAxisCanvas = document.createElement('canvas')

      const isMain = pane.role === 'price'

      mainCanvas.id = `${spec.id}-main`
      mainCanvas.className = isMain ? 'main-canvas main' : 'main-canvas sub'
      mainCanvas.style.position = 'absolute'
      mainCanvas.style.left = '0'
      mainCanvas.style.top = '0'

      overlayCanvas.id = `${spec.id}-overlay`
      overlayCanvas.className = 'overlay-canvas'
      overlayCanvas.style.position = 'absolute'
      overlayCanvas.style.left = '0'
      overlayCanvas.style.top = '0'
      overlayCanvas.style.pointerEvents = 'none'
      overlayCanvas.style.backgroundColor = 'transparent'

      yAxisCanvas.id = `${spec.id}-yAxis`
      yAxisCanvas.className = 'right-axis'
      yAxisCanvas.style.position = 'absolute'
      yAxisCanvas.style.left = '0'

      const renderer = new PaneRenderer(
        { mainCanvas, overlayCanvas, yAxisCanvas },
        pane,
        {
          rightAxisWidth: this.deps.getOption().rightAxisWidth,
          yPaddingPx: this.deps.getOption().yPaddingPx,
          priceLabelWidth: this.deps.getOption().priceLabelWidth,
        },
        this.deps.getSharedWebGLSurface(),
      )

      return renderer
    })

    const dom = this.deps.getDom()
    const canvasLayer = dom.canvasLayer
    const rightAxisLayer = dom.rightAxisLayer
    if (canvasLayer) {
      const existingCanvases = canvasLayer.querySelectorAll('canvas:not(.x-axis-canvas)')
      existingCanvases.forEach((canvas) => canvas.remove())
    }
    if (rightAxisLayer) {
      const existingAxisCanvases = rightAxisLayer.querySelectorAll('canvas.right-axis')
      existingAxisCanvases.forEach((canvas) => canvas.remove())
    }

    this.paneRenderers.forEach((renderer) => {
      const domEls = renderer.getDom()
      canvasLayer.appendChild(domEls.mainCanvas)
      canvasLayer.appendChild(domEls.overlayCanvas)
      rightAxisLayer.appendChild(domEls.yAxisCanvas)
    })

    this.deps.setKnownPaneIds(
      this.paneRenderers.map((renderer) => renderer.getPane().id),
    )

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
      const ratio = prev !== undefined ? prev : (incoming > 0 ? incoming : 1)
      next.set(spec.id, ratio)
    }
    this._internalPaneRatios = next
    this.normalizeVisiblePaneRatios(specs)
    this.syncPaneRatiosToSpecs()
  }

  private syncPaneRatiosToSpecs(): void {
    const visible = this._paneSpecs.filter((p) => p.visible !== false)
    const visibleSum = visible.reduce((s, p) => s + (this._internalPaneRatios.get(p.id) ?? p.ratio ?? 0), 0)
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
    const visible = specs.filter((p) => p.visible !== false)
    if (visible.length === 0) return

    let sum = 0
    for (const spec of visible) {
      const raw = this._internalPaneRatios.get(spec.id) ?? spec.ratio ?? 0
      const safe = Number.isFinite(raw) && raw > 0 ? raw : 0
      this._internalPaneRatios.set(spec.id, safe)
      sum += safe
    }

    if (sum <= 0) {
      const equal = 1 / visible.length
      for (const spec of visible) {
        this._internalPaneRatios.set(spec.id, equal)
      }
      return
    }

    for (const spec of visible) {
      const v = this._internalPaneRatios.get(spec.id) ?? 0
      this._internalPaneRatios.set(spec.id, v / sum)
    }
  }

  private getPaneMinHeight(spec: PaneSpec, plotHeight: number): number {
    const fallback = this.deps.getOption().defaultPaneMinHeightPx ?? 120
    const raw = spec.minHeightPx ?? fallback
    return Math.max(1, Math.min(Math.round(raw), Math.max(1, plotHeight)))
  }

  private computePaneHeightsByRatio(visibleSpecs: PaneSpec[], availableH: number): number[] {
    if (visibleSpecs.length === 0) return []

    const ratios = visibleSpecs.map((spec) => this._internalPaneRatios.get(spec.id) ?? spec.ratio ?? 0)
    const ratioSum = ratios.reduce((s, r) => s + (r > 0 ? r : 0), 0)
    const safeRatios = ratioSum > 0
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
      heights[heights.length - 1] = Math.max(1, (heights[heights.length - 1] ?? 1) + (availableH - total))
    }

    return heights
  }

  layoutPanes() {
    const vp = this.deps.getViewport()
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
      renderer.setWebGLRegion({
        x: 0,
        y,
        width: vp.plotWidth,
        height: h,
        dpr: vp.dpr,
      })
      this.deps.notifyPaneResize(pane.id, pane)
      const domEls = renderer.getDom()
      domEls.mainCanvas.style.top = `${y}px`
      domEls.overlayCanvas.style.top = `${y}px`
      domEls.yAxisCanvas.style.top = `${y}px`
      domEls.yAxisCanvas.style.left = '0px'

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
    this.emitLayoutChange()
  }

  getPaneLayoutSpecs(): PaneSpec[] {
    const visible = this._paneSpecs.filter((p) => p.visible !== false)
    const sum = visible.reduce((s, p) => s + (this._internalPaneRatios.get(p.id) ?? p.ratio ?? 0), 0)
    const safeSum = sum > 0 ? sum : 1
    return this._paneSpecs.map((spec) => {
      const base = this._internalPaneRatios.get(spec.id) ?? spec.ratio ?? 0
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

  private emitLayoutChange(): void {
    const ratios: Record<string, number> = {}
    this._internalPaneRatios.forEach((ratio, id) => {
      ratios[id] = ratio
    })
    this.deps.onLayoutChange(ratios, this.getPaneLayoutSpecs())
  }

  applyPaneLayoutSpecs(panes: PaneSpec[]): void {
    this._paneSpecs = panes.map((spec) => ({ ...spec }))
    this.syncPaneRatiosFromSpecs(this._paneSpecs)
    this.initPanes()
    this.layoutPanes()
    this.deps.scheduleDraw()
  }

  updatePaneLayout(panes: PaneSpec[]): void {
    this._internalPaneRatios.clear()
    this.applyPaneLayoutSpecs(panes)
  }

  setPaneDefinitions(defs: PaneSpec[]): void {
    this.applyPaneLayoutSpecs(defs)
  }

  upsertPane(def: PaneSpec): void {
    const idx = this._paneSpecs.findIndex((pane) => pane.id === def.id)
    if (idx === -1) {
      this.applyPaneLayoutSpecs([...this._paneSpecs, { ...def }])
      return
    }

    const next = [...this._paneSpecs]
    next[idx] = { ...next[idx], ...def }
    this.applyPaneLayoutSpecs(next)
  }

  removePaneDefinition(paneId: string): void {
    if (!this._paneSpecs.some((pane) => pane.id === paneId)) return
    this._internalPaneRatios.delete(paneId)
    this.applyPaneLayoutSpecs(this._paneSpecs.filter((pane) => pane.id !== paneId))
  }

  addPane(paneId: string): void {
    if (this._paneSpecs.some((spec) => spec.id === paneId)) {
      console.warn(`Pane "${paneId}" already exists`)
      return
    }

    const hasPricePane = this._paneSpecs.some((spec, index) => this.resolvePaneRole(spec, index) === 'price')
    const role: PaneRole = hasPricePane ? 'indicator' : 'price'
    this.applyPaneLayoutSpecs([
      ...this._paneSpecs,
      { id: paneId, ratio: 1, visible: true, role },
    ])
  }

  removePane(paneId: string): void {
    if (!this._paneSpecs.some((spec) => spec.id === paneId)) return

    const next = this._paneSpecs.filter((spec) => spec.id !== paneId)
    this._internalPaneRatios.delete(paneId)
    this.applyPaneLayoutSpecs(next)
  }

  hasPane(paneId: string): boolean {
    return this._paneSpecs.some((spec) => spec.id === paneId)
  }

  resizePaneBoundary(upperPaneId: string, deltaY: number): boolean {
    if (!Number.isFinite(deltaY) || deltaY === 0) return false
    const vp = this.deps.getViewport()
    if (!vp) return false

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

    this.normalizeVisiblePaneRatios(visibleSpecs)
    this.syncPaneRatiosToSpecs()

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
