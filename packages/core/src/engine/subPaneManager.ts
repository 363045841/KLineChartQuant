import { KLineChartError, SUBPANE_ERROR_CODES } from '../errors.js'
import { makePluginLayerId } from '../foundation/plugin/impl/rendererLayerId.js'
import type { RenderContext } from '../foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '../foundation/plugin/index.js'
import type { Renderer } from '../rendering/render/Renderer.js'
import type { Layer } from '../rendering/scene/types.js'
import { getRegisteredIndicatorDefinition } from './indicators/indicatorDefinitionRegistry.js'
import { wrapRendererAsLayer } from './render/layers/wrapRendererAsLayer.js'
import { createIndicatorLayer } from './renderers/Indicator/factory.js'
import { findIndicator } from './renderers/Indicator/indicatorCatalog.js'
import { createIndicatorScaleRendererPlugin } from './renderers/Indicator/scale/indicator_scale.js'
import { createPaneTitleRendererPlugin } from './renderers/paneTitle.js'
import type { SubPaneSpec } from './state/indicatorState.js'

export interface SubPaneResources {
  readonly paneId: string
  readonly indicatorId: string
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

/** 判断指标定义是否拥有副图投影所需的完整 renderer 元数据。 */
export function hasSubPaneRendererMetadata(
  definition: import('./indicators/indicatorMetadata.js').IndicatorMetadata,
  paneId: string,
  indicatorId: string,
): boolean {
  if (definition.category === 'main' || definition.allowMainPane) return false
  try {
    return Boolean(
      definition.getScaleRendererName({ paneId, indicatorId }) &&
        definition.getPaneTitleRendererName({ paneId, indicatorId }),
    )
  } catch {
    return false
  }
}

export interface SubPaneContext {
  /** 副图增删改后通知实例链路重建渲染投影。 */
  onPaneProjectionChanged: () => void
  getRenderer: <T extends Layer<RenderContext> = Layer<RenderContext>>(
    name: string,
  ) => T | undefined
  useRenderer: (layer: Layer<RenderContext>) => void
  removeRenderer: (name: string) => void
  getSceneRenderer: () => Renderer
  getOption: () => {
    rightAxisWidth: number
    priceLabelWidth?: number
    yPaddingPx: number
  }
  getCrosshairPos: () => { x: number; y: number } | null
  getCrosshairPrice: () => number | null
  getActivePaneId: () => string | null
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
    indicatorId: entry.indicatorId,
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
          // params 变化：直接替换 Layer（原子重建），避免渲染器内部持有 config
          this.unmount(ctx, current, true)
          this.mount(ctx, candidate)
          this.mountPaneTitleRenderer(ctx, candidate)
        } else {
          this.mount(ctx, candidate)
          this.mountPaneTitleRenderer(ctx, candidate)
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

    if (changed) ctx.onPaneProjectionChanged()
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
    ctx.onPaneProjectionChanged()
  }

  private describeEntry(ctx: SubPaneContext, spec: SubPaneSpec): ProjectedSubPaneEntry {
    const definition = getRegisteredIndicatorDefinition(spec.indicatorId)
    if (!definition) {
      throw new KLineChartError(
        SUBPANE_ERROR_CODES.UNKNOWN_INDICATOR,
        `[SubPaneManager] Unknown indicator: ${spec.indicatorId}`,
      )
    }
    if (!hasSubPaneRendererMetadata(definition, spec.paneId, spec.indicatorId)) {
      throw new KLineChartError(
        SUBPANE_ERROR_CODES.MISSING_RENDERER_METADATA,
        `[SubPaneManager] Indicator "${spec.indicatorId}" is missing required sub-pane renderer metadata`,
      )
    }
    const rendererName = definition.getRendererName({
      paneId: spec.paneId,
      indicatorId: spec.indicatorId,
    })
    const scaleRendererName = definition.getScaleRendererName({
      paneId: spec.paneId,
      indicatorId: spec.indicatorId,
    })!
    const paneTitleRendererName = definition.getPaneTitleRendererName({
      paneId: spec.paneId,
      indicatorId: spec.indicatorId,
    })!
    return {
      ...spec,
      params: { ...spec.params },
      rendererName,
      scaleRendererName,
      paneTitleRendererName,
      layerId: makePluginLayerId(rendererName),
      scaleLayerId: makePluginLayerId(scaleRendererName),
      paneTitleLayerId: makePluginLayerId(paneTitleRendererName),
    }
  }

  private mount(ctx: SubPaneContext, entry: ProjectedSubPaneEntry): void {
    const definition = getRegisteredIndicatorDefinition(entry.indicatorId)!
    if (!ctx.getRenderer(entry.rendererName)) {
      const layer = createIndicatorLayer({
        paneId: entry.paneId,
        indicatorId: entry.indicatorId,
        instanceId: entry.instanceId,
        definition,
        params: { ...entry.params },
        getContext: () => ctx.getRenderContext(entry.paneId),
        getSceneRenderer: ctx.getSceneRenderer,
      })
      // useRenderer：唯一 Scene Layer
      ctx.useRenderer(layer)
    }
    this.mountScaleRenderer(ctx, entry)
  }

  private mountScaleRenderer(ctx: SubPaneContext, entry: ProjectedSubPaneEntry): void {
    if (ctx.getRenderer(entry.scaleRendererName)) {
      return
    }
    const definition = getRegisteredIndicatorDefinition(entry.indicatorId)
    const opt = ctx.getOption()
    const axisWidth = opt.rightAxisWidth + (opt.priceLabelWidth ?? 60)
    const getCrosshair = () => {
      const pos = ctx.getCrosshairPos()
      const price = ctx.getCrosshairPrice()
      if (pos && price !== null) return { y: pos.y, price, activePaneId: ctx.getActivePaneId() }
      return null
    }
    const baseOptions = {
      axisWidth,
      paneId: entry.paneId,
      instanceId: entry.instanceId,
      yPaddingPx: opt.yPaddingPx,
      getCrosshair,
      getContext: () => ctx.getRenderContext(entry.paneId),
      getSceneRenderer: ctx.getSceneRenderer,
    }
    const plugin = definition?.scaleRendererFactory
      ? definition.scaleRendererFactory({ ...baseOptions, indicatorId: entry.indicatorId })
      : definition?.scale
        ? createIndicatorScaleRendererPlugin({
            ...baseOptions,
            indicatorKey: definition.scale.indicatorKey ?? definition.name,
            label: definition.scale.label ?? definition.displayName,
            decimals: definition.scale.decimals,
          })
        : null
    if (!plugin) return
    ctx.useRenderer(
      wrapRendererAsLayer(plugin, {
        id: entry.scaleLayerId,
        role: 'indicator',
        pane: entry.paneId,
        z: RENDERER_PRIORITY.INDICATOR_SCALE,
        getContext: () => ctx.getRenderContext(entry.paneId),
        getSceneRenderer: ctx.getSceneRenderer,
      }),
    )
  }

  private mountPaneTitleRenderer(ctx: SubPaneContext, entry: ProjectedSubPaneEntry): void {
    if (ctx.getRenderer(entry.paneTitleRendererName)) {
      return
    }
    const renderer = createPaneTitleRendererPlugin({
      paneId: entry.paneId,
      title: findIndicator(entry.indicatorId)?.label ?? entry.indicatorId,
      indicatorId: entry.indicatorId,
      instanceId: entry.instanceId,
      params: { ...entry.params },
    })
    ctx.useRenderer(
      wrapRendererAsLayer(renderer, {
        id: entry.paneTitleLayerId,
        role: 'overlay',
        pane: entry.paneId,
        z: RENDERER_PRIORITY.OVERLAY,
        getContext: () => ctx.getRenderContext(entry.paneId),
        getSceneRenderer: ctx.getSceneRenderer,
      }),
    )
  }

  private unmount(ctx: SubPaneContext, entry: SubPaneResources, preserveTitle = false): void {
    // removeRenderer 同步卸 Scene Layer 并触发 Layer.dispose
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
}
