import { KLineChartError } from '../errors'
import type {
  RendererPlugin,
  RendererPluginWithHost,
  RenderContext,
} from '../foundation/plugin/index'
import { createSignal, type ReadonlySignal } from '../foundation/reactivity/signal'
import { createLayerFromPlugin } from '../rendering/scene/createLayerFromPlugin'
import type { Layer } from '../rendering/scene/types'

import type { PaneSpec } from './chartTypes'
import type { IndicatorScheduler } from './indicators/scheduler'
import type { SubIndicatorType } from './renderers/Indicator'
import { createSubIndicatorRenderer } from './renderers/Indicator'
import { findIndicator } from './renderers/Indicator/indicatorCatalog'
import { createIndicatorScaleRendererPlugin } from './renderers/Indicator/scale/indicator_scale'
import { createPaneTitleRendererPlugin } from './renderers/paneTitle'

export interface SubPaneEntry {
  paneId: string
  indicatorId: SubIndicatorType
  params: Record<string, unknown>
  rendererName: string
  scaleRendererName: string
  paneTitleRendererName: string
  layerId: string
  scaleLayerId: string
  paneTitleLayerId: string
}

export interface SubPaneContext {
  getIndicatorScheduler: () => IndicatorScheduler
  hasPane: (paneId: string) => boolean
  upsertPane: (def: PaneSpec) => void
  getRenderer: <T extends RendererPlugin = RendererPlugin>(name: string) => T | undefined
  useRenderer: (
    plugin: RendererPlugin | RendererPluginWithHost,
    config?: Record<string, unknown>,
  ) => void
  removeRenderer: (name: string) => void
  setRendererEnabled: (name: string, enabled: boolean) => void
  removePaneDefinition: (paneId: string) => void
  updateRendererConfig: (name: string, config: Record<string, unknown>) => void
  getRightAxisWidth: () => number
  getPriceLabelWidth: () => number
  getYPaddingPx: () => number
  getCrosshairPos: () => { x: number; y: number } | null
  getCrosshairPrice: () => number | null
  getActivePaneId: () => string | null
  addLayer: (layer: Layer) => void
  removeLayer: (id: string) => boolean
  getLayer: (id: string) => Layer | null
  setLayerVisibility: (id: string, visible: boolean) => void
  getRenderContext: (paneId: string) => RenderContext | null
}

export class SubPaneManager {
  private entries = new Map<string, SubPaneEntry>()
  private _entriesSignal = createSignal<ReadonlyArray<SubPaneEntry>>([])

  get entriesSignal(): ReadonlySignal<ReadonlyArray<SubPaneEntry>> {
    return this._entriesSignal
  }

  private syncEntriesSignal(): void {
    this._entriesSignal.set(this.getAll())
  }

  create(
    ctx: SubPaneContext,
    paneId: string,
    indicatorId: SubIndicatorType,
    params: Record<string, unknown>,
  ): boolean {
    if (this.entries.has(paneId)) {
      return true
    }

    const scaleRendererName = `${indicatorId.toLowerCase()}_scale_${paneId}`
    const paneTitleRendererName = `paneTitle_${paneId}`
    const renderer = this.createIndicatorRenderer(ctx, paneId, indicatorId, params)
    if (!renderer) return false
    const rendererName = renderer.name
    const layerId = `plugin:${rendererName}`

    const paneExists = ctx.hasPane(paneId)
    if (!paneExists) {
      ctx.upsertPane({ id: paneId, ratio: 1, visible: true, role: 'indicator' })
    }

    const existingRenderer = ctx.getRenderer(rendererName)
    if (!existingRenderer) {
      ctx.useRenderer(renderer, params as Record<string, number | boolean | string>)
      ctx.setRendererEnabled(rendererName, false)
      const layer = createLayerFromPlugin(renderer, () => ctx.getRenderContext(paneId), paneId)
      ctx.addLayer(layer)
    }

    this.mountScaleRenderer(ctx, paneId, indicatorId, scaleRendererName)
    this.mountPaneTitleRenderer(ctx, paneId, indicatorId, params)

    const scaleLayerId = `plugin:${scaleRendererName}`
    const paneTitleLayerId = `plugin:${paneTitleRendererName}`

    this.entries.set(paneId, {
      paneId,
      indicatorId,
      params,
      rendererName,
      scaleRendererName,
      paneTitleRendererName,
      layerId,
      scaleLayerId,
      paneTitleLayerId,
    })

    this.syncSchedulerConfig(ctx, paneId, indicatorId, params)

    ctx.getIndicatorScheduler().onSubPaneChanged()

    this.syncEntriesSignal()
    return true
  }

  remove(ctx: SubPaneContext, paneId: string): void {
    const entry = this.entries.get(paneId)
    if (!entry) return

    ctx.removeRenderer(entry.rendererName)
    ctx.removeRenderer(entry.scaleRendererName)
    ctx.removeRenderer(entry.paneTitleRendererName)
    ctx.removeLayer(entry.layerId)
    ctx.removeLayer(entry.scaleLayerId)
    ctx.removeLayer(entry.paneTitleLayerId)

    this.entries.delete(paneId)

    if (ctx.hasPane(paneId)) {
      ctx.removePaneDefinition(paneId)
    }

    ctx.getIndicatorScheduler().onSubPaneChanged()
    this.syncEntriesSignal()
  }

  replaceIndicator(
    ctx: SubPaneContext,
    paneId: string,
    newIndicatorId: SubIndicatorType,
    newParams: Record<string, unknown>,
  ): void {
    const entry = this.entries.get(paneId)
    if (!entry) return

    ctx.removeRenderer(entry.rendererName)
    ctx.removeRenderer(entry.scaleRendererName)
    ctx.removeRenderer(entry.paneTitleRendererName)
    ctx.removeLayer(entry.layerId)
    ctx.removeLayer(entry.scaleLayerId)
    ctx.removeLayer(entry.paneTitleLayerId)

    const newScaleRendererName = `${newIndicatorId.toLowerCase()}_scale_${paneId}`
    const newPaneTitleRendererName = `paneTitle_${paneId}`
    const renderer = this.createIndicatorRenderer(ctx, paneId, newIndicatorId, newParams)
    if (!renderer) return
    const newRendererName = renderer.name
    const newLayerId = `plugin:${newRendererName}`
    const newScaleLayerId = `plugin:${newScaleRendererName}`
    const newPaneTitleLayerId = `plugin:${newPaneTitleRendererName}`

    ctx.useRenderer(renderer, newParams as Record<string, number | boolean | string>)
    ctx.setRendererEnabled(newRendererName, false)
    const layer = createLayerFromPlugin(renderer, () => ctx.getRenderContext(paneId), paneId)
    ctx.addLayer(layer)

    this.mountScaleRenderer(ctx, paneId, newIndicatorId, newScaleRendererName)
    this.mountPaneTitleRenderer(ctx, paneId, newIndicatorId, newParams)

    this.syncSchedulerConfig(ctx, paneId, newIndicatorId, newParams)

    this.entries.set(paneId, {
      paneId,
      indicatorId: newIndicatorId,
      params: newParams,
      rendererName: newRendererName,
      scaleRendererName: newScaleRendererName,
      paneTitleRendererName: newPaneTitleRendererName,
      layerId: newLayerId,
      scaleLayerId: newScaleLayerId,
      paneTitleLayerId: newPaneTitleLayerId,
    })

    ctx.getIndicatorScheduler().onSubPaneChanged()
    this.syncEntriesSignal()
  }

  updateParams(ctx: SubPaneContext, paneId: string, params: Record<string, unknown>): void {
    const entry = this.entries.get(paneId)
    if (!entry) return

    entry.params = { ...params }

    ctx.updateRendererConfig(entry.rendererName, params)
    ctx.updateRendererConfig(entry.paneTitleRendererName, {
      params: entry.params,
      indicatorId: entry.indicatorId,
    })

    this.syncSchedulerConfig(ctx, paneId, entry.indicatorId, entry.params)
    this.syncEntriesSignal()
  }

  getByPaneId(paneId: string): SubPaneEntry | undefined {
    return this.entries.get(paneId)
  }

  private createIndicatorRenderer(
    ctx: SubPaneContext,
    paneId: string,
    indicatorId: SubIndicatorType,
    params: Record<string, unknown>,
  ): RendererPlugin {
    const definition = ctx.getIndicatorScheduler().getIndicatorMetadata(indicatorId)
    if (!definition) {
      throw new KLineChartError(
        'NOT_REGISTERED',
        `[SubPaneManager] Unknown indicator: ${indicatorId}`,
      )
    }
    return createSubIndicatorRenderer({ indicatorId, paneId, definition, params })
  }

  getAll(): SubPaneEntry[] {
    return [...this.entries.values()]
  }

  getPaneIds(): string[] {
    return [...this.entries.keys()]
  }

  clear(ctx: SubPaneContext): void {
    for (const entry of this.entries.values()) {
      ctx.removeRenderer(entry.rendererName)
      ctx.removeRenderer(entry.scaleRendererName)
      ctx.removeRenderer(entry.paneTitleRendererName)
      ctx.removeLayer(entry.layerId)
      ctx.removeLayer(entry.scaleLayerId)
      ctx.removeLayer(entry.paneTitleLayerId)
    }
    this.entries.clear()
    ctx.getIndicatorScheduler().onSubPaneChanged()
    this.syncEntriesSignal()
  }

  private syncSchedulerConfig(
    ctx: SubPaneContext,
    paneId: string,
    indicatorId: SubIndicatorType,
    params: Record<string, unknown>,
  ): void {
    const scheduler = ctx.getIndicatorScheduler()
    const definition = scheduler.getIndicatorMetadata(indicatorId)
    definition?.updateConfig?.(scheduler, params, paneId)
  }

  private mountScaleRenderer(
    ctx: SubPaneContext,
    paneId: string,
    indicatorId: SubIndicatorType,
    scaleRendererName: string,
  ): void {
    const existing = ctx.getRenderer(scaleRendererName)
    if (existing) {
      // ensure existing layer is visible
      ctx.setLayerVisibility(`plugin:${scaleRendererName}`, true)
      return
    }

    const axisWidth = ctx.getRightAxisWidth() + (ctx.getPriceLabelWidth() ?? 60)
    const yPaddingPx = ctx.getYPaddingPx()
    const getCrosshair = () => {
      const pos = ctx.getCrosshairPos()
      const price = ctx.getCrosshairPrice()
      const activePaneId = ctx.getActivePaneId()
      if (pos && price !== null) {
        return { y: pos.y, price, activePaneId }
      }
      return null
    }

    const opts = { axisWidth, paneId, yPaddingPx, getCrosshair }

    const definition = ctx.getIndicatorScheduler().getIndicatorMetadata(indicatorId)
    if (definition?.scaleRendererFactory) {
      const plugin = definition.scaleRendererFactory({ ...opts, indicatorId })
      ctx.useRenderer(plugin)
      ctx.setRendererEnabled(scaleRendererName, false)
      const layer = createLayerFromPlugin(plugin, () => ctx.getRenderContext(paneId), paneId)
      ctx.addLayer(layer)
      return
    }

    if (definition?.scale) {
      const plugin = createIndicatorScaleRendererPlugin({
        ...opts,
        indicatorKey: definition.scale.indicatorKey ?? definition.name,
        label: definition.scale.label ?? definition.displayName,
        decimals: definition.scale.decimals,
      })
      ctx.useRenderer(plugin)
      ctx.setRendererEnabled(scaleRendererName, false)
      const layer = createLayerFromPlugin(plugin, () => ctx.getRenderContext(paneId), paneId)
      ctx.addLayer(layer)
      return
    }
  }

  private mountPaneTitleRenderer(
    ctx: SubPaneContext,
    paneId: string,
    indicatorId: SubIndicatorType,
    params: Record<string, unknown>,
  ): void {
    const rendererName = `paneTitle_${paneId}`
    const existing = ctx.getRenderer(rendererName)
    if (existing) {
      ctx.updateRendererConfig(rendererName, { params, indicatorId })
      ctx.setLayerVisibility(`plugin:${rendererName}`, true)
      return
    }

    const renderer = createPaneTitleRendererPlugin({
      paneId,
      title: findIndicator(indicatorId)?.label ?? indicatorId,
      indicatorId,
      params,
    })
    ctx.useRenderer(renderer)
    ctx.setRendererEnabled(rendererName, false)
    const layer = createLayerFromPlugin(renderer, () => ctx.getRenderContext(paneId), paneId)
    ctx.addLayer(layer)
  }
}
