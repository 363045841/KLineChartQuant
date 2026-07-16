import { KLineChartError } from '../errors'
import type {
  RendererPlugin,
  RendererPluginWithHost,
  RenderContext,
} from '../foundation/plugin/index'
import type { Layer } from '../rendering/scene/types'
import type { IndicatorScheduler } from './indicators/scheduler'
import { findIndicator } from './renderers/Indicator/indicatorCatalog'
import { createSubIndicatorRenderer } from './renderers/Indicator'
import { createIndicatorScaleRendererPlugin } from './renderers/Indicator/scale/indicator_scale'
import { createPaneTitleRendererPlugin } from './renderers/paneTitle'
import type { SubPaneSpec } from './state/subPaneState'

export interface SubPaneResources {
  readonly paneId: string
  readonly rendererName: string
  readonly scaleRendererName: string
  readonly paneTitleRendererName: string
  readonly layerId: string
  readonly scaleLayerId: string
  readonly paneTitleLayerId: string
}

export interface SubPaneEntry extends SubPaneSpec {
  readonly rendererName?: string
  readonly scaleRendererName?: string
  readonly paneTitleRendererName?: string
  readonly layerId?: string
  readonly scaleLayerId?: string
  readonly paneTitleLayerId?: string
}

type ProjectedSubPaneEntry = SubPaneSpec & SubPaneResources
type MountedSubPaneResources = SubPaneResources & { readonly projectionKey: string }

export interface SubPaneContext {
  getIndicatorScheduler: () => IndicatorScheduler
  getRenderer: <T extends RendererPlugin = RendererPlugin>(name: string) => T | undefined
  useRenderer: (
    plugin: RendererPlugin | RendererPluginWithHost,
    config?: Record<string, unknown>,
  ) => void
  removeRenderer: (name: string) => void
  setRendererEnabled: (name: string, enabled: boolean) => void
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

function stableConfig(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableConfig).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableConfig(item)}`)
      .join(',')}}`
  }
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'number:NaN'
    if (value === Number.POSITIVE_INFINITY) return 'number:Infinity'
    if (value === Number.NEGATIVE_INFINITY) return 'number:-Infinity'
    if (Object.is(value, -0)) return 'number:-0'
    return `number:${value}`
  }
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  return `${typeof value}:${JSON.stringify(value) ?? String(value)}`
}

function toResources(entry: ProjectedSubPaneEntry): SubPaneResources {
  return {
    paneId: entry.paneId,
    rendererName: entry.rendererName,
    scaleRendererName: entry.scaleRendererName,
    paneTitleRendererName: entry.paneTitleRendererName,
    layerId: entry.layerId,
    scaleLayerId: entry.scaleLayerId,
    paneTitleLayerId: entry.paneTitleLayerId,
  }
}

/** 副图 renderer/layer 的 runtime projection，不持有业务 Signal。 */
export class SubPaneManager {
  private readonly mounted = new Map<string, MountedSubPaneResources>()

  reconcile(ctx: SubPaneContext, desired: ReadonlyArray<SubPaneSpec>): boolean {
    const desiredByPane = new Map(desired.map((spec) => [spec.paneId, spec]))
    let changed = false

    for (const [paneId, entry] of [...this.mounted]) {
      if (desiredByPane.has(paneId)) continue
      this.unmount(ctx, entry)
      this.mounted.delete(paneId)
      changed = true
    }

    for (const spec of desired) {
      const current = this.mounted.get(spec.paneId)
      let candidate: ProjectedSubPaneEntry | undefined
      try {
        candidate = this.describeEntry(ctx, spec)
        const nextProjectionKey = `${spec.indicatorId}:${stableConfig(spec.params)}`
        if (current?.projectionKey === nextProjectionKey) continue

        if (current?.rendererName === candidate.rendererName) {
          this.updateParams(ctx, current, spec)
        } else {
          this.mount(ctx, candidate)
          this.mountPaneTitleRenderer(ctx, candidate)
          this.syncSchedulerConfig(ctx, spec.paneId, spec.indicatorId, spec.params)
          if (current) this.unmount(ctx, current, true)
        }
        this.mounted.set(spec.paneId, {
          ...toResources(candidate),
          projectionKey: nextProjectionKey,
        })
        changed = true
      } catch (error) {
        if (candidate) {
          this.invalidateProjection(ctx, candidate, current)
        } else if (current) {
          this.unmount(ctx, current)
        }
        this.mounted.delete(spec.paneId)
        console.error(`[SubPaneManager] Failed to project pane "${spec.paneId}":`, error)
      }
    }

    if (changed) ctx.getIndicatorScheduler().onSubPaneChanged()
    return changed
  }

  getMountedResources(paneId: string): SubPaneResources | undefined {
    const resources = this.mounted.get(paneId)
    if (!resources) return undefined
    const { projectionKey: _, ...snapshot } = resources
    return { ...snapshot }
  }

  clear(ctx: SubPaneContext): void {
    if (this.mounted.size === 0) return
    for (const entry of this.mounted.values()) this.unmount(ctx, entry)
    this.mounted.clear()
    ctx.getIndicatorScheduler().onSubPaneChanged()
  }

  private describeEntry(ctx: SubPaneContext, spec: SubPaneSpec): ProjectedSubPaneEntry {
    const definition = ctx.getIndicatorScheduler().getIndicatorMetadata(spec.indicatorId)
    if (!definition) {
      throw new KLineChartError(
        'NOT_REGISTERED',
        `[SubPaneManager] Unknown indicator: ${spec.indicatorId}`,
      )
    }
    const renderer = createSubIndicatorRenderer({
      paneId: spec.paneId,
      indicatorId: spec.indicatorId,
      definition,
      params: { ...spec.params },
    })
    const scaleRendererName = `${spec.indicatorId.toLowerCase()}_scale_${spec.paneId}`
    const paneTitleRendererName = `paneTitle_${spec.paneId}`
    return {
      ...spec,
      params: { ...spec.params },
      rendererName: renderer.name,
      scaleRendererName,
      paneTitleRendererName,
      layerId: `plugin:${renderer.name}`,
      scaleLayerId: `plugin:${scaleRendererName}`,
      paneTitleLayerId: `plugin:${paneTitleRendererName}`,
    }
  }

  private mount(ctx: SubPaneContext, entry: ProjectedSubPaneEntry): void {
    const definition = ctx.getIndicatorScheduler().getIndicatorMetadata(entry.indicatorId)!
    if (!ctx.getRenderer(entry.rendererName)) {
      const renderer = createSubIndicatorRenderer({
        paneId: entry.paneId,
        indicatorId: entry.indicatorId,
        definition,
        params: { ...entry.params },
      })
      // useRenderer：注册表 + 唯一 Scene Layer
      ctx.useRenderer(renderer, { ...entry.params })
    }
    this.mountScaleRenderer(ctx, entry)
  }

  private mountScaleRenderer(ctx: SubPaneContext, entry: ProjectedSubPaneEntry): void {
    if (ctx.getRenderer(entry.scaleRendererName)) {
      ctx.setLayerVisibility(entry.scaleLayerId, true)
      return
    }
    const definition = ctx.getIndicatorScheduler().getIndicatorMetadata(entry.indicatorId)
    const axisWidth = ctx.getRightAxisWidth() + ctx.getPriceLabelWidth()
    const getCrosshair = () => {
      const pos = ctx.getCrosshairPos()
      const price = ctx.getCrosshairPrice()
      if (pos && price !== null) return { y: pos.y, price, activePaneId: ctx.getActivePaneId() }
      return null
    }
    const options = {
      axisWidth,
      paneId: entry.paneId,
      yPaddingPx: ctx.getYPaddingPx(),
      getCrosshair,
    }
    const plugin = definition?.scaleRendererFactory
      ? definition.scaleRendererFactory({ ...options, indicatorId: entry.indicatorId })
      : definition?.scale
        ? createIndicatorScaleRendererPlugin({
            ...options,
            indicatorKey: definition.scale.indicatorKey ?? definition.name,
            label: definition.scale.label ?? definition.displayName,
            decimals: definition.scale.decimals,
          })
        : null
    if (!plugin) return
    ctx.useRenderer(plugin)
  }

  private mountPaneTitleRenderer(ctx: SubPaneContext, entry: ProjectedSubPaneEntry): void {
    if (ctx.getRenderer(entry.paneTitleRendererName)) {
      ctx.updateRendererConfig(entry.paneTitleRendererName, {
        params: { ...entry.params },
        indicatorId: entry.indicatorId,
      })
      ctx.setLayerVisibility(entry.paneTitleLayerId, true)
      return
    }
    const renderer = createPaneTitleRendererPlugin({
      paneId: entry.paneId,
      title: findIndicator(entry.indicatorId)?.label ?? entry.indicatorId,
      indicatorId: entry.indicatorId,
      params: { ...entry.params },
    })
    ctx.useRenderer(renderer)
  }

  private updateParams(ctx: SubPaneContext, resources: SubPaneResources, spec: SubPaneSpec): void {
    const snapshot = { ...spec.params }
    ctx.updateRendererConfig(resources.rendererName, snapshot)
    ctx.updateRendererConfig(resources.paneTitleRendererName, {
      params: snapshot,
      indicatorId: spec.indicatorId,
    })
    this.syncSchedulerConfig(ctx, spec.paneId, spec.indicatorId, snapshot)
  }

  private unmount(ctx: SubPaneContext, entry: SubPaneResources, preserveTitle = false): void {
    // removeRenderer 已同步卸 Scene Layer + Manager onUninstall，勿再 removeLayer
    ctx.removeRenderer(entry.rendererName)
    ctx.removeRenderer(entry.scaleRendererName)
    if (!preserveTitle) {
      ctx.removeRenderer(entry.paneTitleRendererName)
    }
  }

  private invalidateProjection(
    ctx: SubPaneContext,
    candidate: ProjectedSubPaneEntry,
    current: SubPaneResources | undefined,
  ): void {
    this.unmount(ctx, toResources(candidate))
    if (current && current.rendererName !== candidate.rendererName) this.unmount(ctx, current)
  }

  private syncSchedulerConfig(
    ctx: SubPaneContext,
    paneId: string,
    indicatorId: string,
    params: Readonly<Record<string, unknown>>,
  ): void {
    const scheduler = ctx.getIndicatorScheduler()
    scheduler.getIndicatorMetadata(indicatorId)?.updateConfig?.(scheduler, { ...params }, paneId)
  }
}
