import { KLineChartError, SUBPANE_ERROR_CODES } from '../../../errors.js'
import { encodeStableNumber } from '../../../foundation/utils/stableNumber.js'
import type { Layer } from '../../../rendering/scene/types.js'
import {
  getRegisteredIndicatorDefinition,
  resolveIndicatorLayerId,
} from '../../indicators/indicatorDefinitionRegistry.js'
import { createIndicatorLayer } from '../../renderers/Indicator/factory.js'
import {
  createIndicatorScaleLayer,
  hasIndicatorScaleCrosshairLayer,
  resolveIndicatorScaleCrosshairLayerId,
} from '../../renderers/Indicator/scale/indicator_scale.js'
import type { SubPaneSpec } from '../../state/indicatorState.js'
import type { SubPaneContext, SubPaneResources } from '../types.js'
import { DEFAULT_PRICE_LABEL_WIDTH } from '../types.js'

type ProjectedSubPaneEntry = SubPaneSpec & SubPaneResources & { readonly stacked: boolean }
type MountedSubPaneResources = SubPaneResources & {
  readonly projectionKey: string
  /** 当前投影的隐藏状态，用于判断是否需要重建置灰标题。 */
  readonly hidden: boolean
}

/** 判断指标定义是否拥有副图投影所需的完整 renderer 元数据。 */
export function hasSubPaneRendererMetadata(
  definition: import('../../indicators/indicatorMetadata.js').IndicatorMetadata,
  paneId: string,
  indicatorId: string,
): boolean {
  if (definition.category === 'main') return false
  try {
    return Boolean(definition.getScaleRendererName({ paneId, indicatorId }))
  } catch {
    return false
  }
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
    return encodeStableNumber(value)
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
    layerId: entry.layerId,
    scaleLayerId: entry.scaleLayerId,
  }
}

/** 副图 renderer/layer 的 runtime projection，不持有业务 Signal。 */
export class SubPaneManager {
  /** 按实例身份挂载；同一面板可以挂多个实例（同类叠加）。 */
  private readonly mounted = new Map<string, MountedSubPaneResources>()
  /** paneId → 该面板共享的坐标轴层 id；最后一个实例卸载时才移除。 */
  private readonly scaleLayers = new Map<string, string>()

  reconcile(ctx: SubPaneContext, desired: ReadonlyArray<SubPaneSpec>): boolean {
    const desiredById = new Map(desired.map((spec) => [spec.instanceId, spec]))
    // 同一面板内的实例数决定层身份是否必须带实例，以及坐标轴层是否还要保留。
    const stackSize = new Map<string, number>()
    for (const spec of desired) stackSize.set(spec.paneId, (stackSize.get(spec.paneId) ?? 0) + 1)
    let changed = false

    for (const [instanceId, entry] of [...this.mounted]) {
      if (desiredById.has(instanceId)) continue
      this.unmount(ctx, entry)
      this.mounted.delete(instanceId)
      changed = true
    }

    for (const spec of desired) {
      const current = this.mounted.get(spec.instanceId)
      let candidate: ProjectedSubPaneEntry | undefined
      try {
        const stacked = (stackSize.get(spec.paneId) ?? 1) > 1
        candidate = this.describeEntry(ctx, spec, stacked)
        const nextProjectionKey = `${spec.indicatorId}:${spec.hidden ? 'hidden' : 'shown'}:${stableConfig(spec.params)}`
        if (current?.projectionKey === nextProjectionKey) {
          this.ensureScaleLayer(ctx, candidate)
          continue
        }

        if (candidate.hidden) {
          // 隐藏只卸载数据与坐标轴，图例由实例状态继续投影。
          if (current) this.unmount(ctx, current)
        } else if (current?.hidden) {
          // 从隐藏恢复：全量重建，确保标题重新着色并挂回绘制与坐标轴。
          if (current) this.unmount(ctx, current)
          this.mount(ctx, candidate)
        } else if (current?.rendererName === candidate.rendererName) {
          // params 变化：直接替换 Layer（原子重建），避免渲染器内部持有 config
          this.unmount(ctx, current)
          this.mount(ctx, candidate)
        } else {
          this.mount(ctx, candidate)
          if (current) this.unmount(ctx, current)
        }
        this.mounted.set(spec.instanceId, {
          ...toResources(candidate),
          projectionKey: nextProjectionKey,
          hidden: candidate.hidden === true,
        })
        changed = true
      } catch (error) {
        if (candidate) {
          this.invalidateProjection(ctx, candidate, current)
        } else if (current) {
          this.unmount(ctx, current)
        }
        this.mounted.delete(spec.instanceId)
        console.error(`[SubPaneManager] Failed to project pane "${spec.paneId}":`, error)
      }
    }

    this.pruneScaleLayers(ctx, stackSize)
    if (changed) ctx.onPaneProjectionChanged()
    return changed
  }

  getMountedResources(instanceId: string): SubPaneResources | undefined {
    const resources = this.mounted.get(instanceId)
    if (!resources) return undefined
    const { projectionKey: _, hidden: _hidden, ...snapshot } = resources
    return { ...snapshot }
  }

  clear(ctx: SubPaneContext): void {
    if (this.mounted.size === 0 && this.scaleLayers.size === 0) return
    for (const entry of this.mounted.values()) this.unmount(ctx, entry)
    this.mounted.clear()
    for (const scaleLayerId of this.scaleLayers.values()) this.removeScaleLayer(ctx, scaleLayerId)
    this.scaleLayers.clear()
    ctx.onPaneProjectionChanged()
  }

  /** 面板没有实例时移除共享坐标轴层；Panel 仍在则保留。 */
  private pruneScaleLayers(ctx: SubPaneContext, stackSize: ReadonlyMap<string, number>): void {
    for (const [paneId, scaleLayerId] of [...this.scaleLayers]) {
      if ((stackSize.get(paneId) ?? 0) > 0) continue
      this.removeScaleLayer(ctx, scaleLayerId)
      this.scaleLayers.delete(paneId)
    }
  }

  private removeScaleLayer(ctx: SubPaneContext, scaleLayerId: string): void {
    ctx.removeRenderer(scaleLayerId)
    ctx.removeRenderer(resolveIndicatorScaleCrosshairLayerId(scaleLayerId))
  }

  private describeEntry(
    ctx: SubPaneContext,
    spec: SubPaneSpec,
    stacked: boolean,
  ): ProjectedSubPaneEntry {
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
      instanceId: spec.instanceId,
      stacked,
    })
    const scaleRendererName = definition.getScaleRendererName({
      paneId: spec.paneId,
      indicatorId: spec.indicatorId,
    })!
    return {
      ...spec,
      params: { ...spec.params },
      stacked,
      rendererName,
      scaleRendererName,
      layerId: resolveIndicatorLayerId(spec.indicatorId, spec.paneId, {
        instanceId: spec.instanceId,
        stacked,
      }),
      scaleLayerId: resolveIndicatorLayerId(spec.indicatorId, spec.paneId, { part: 'scale' }),
    }
  }

  private mount(ctx: SubPaneContext, entry: ProjectedSubPaneEntry): void {
    const definition = getRegisteredIndicatorDefinition(entry.indicatorId)!
    if (!ctx.getRenderer(entry.layerId)) {
      const layer = createIndicatorLayer({
        paneId: entry.paneId,
        indicatorId: entry.indicatorId,
        instanceId: entry.instanceId,
        definition,
        params: { ...entry.params },
        stacked: entry.stacked,
      })
      // useRenderer：唯一 Scene Layer
      ctx.useRenderer(layer)
    }
    this.ensureScaleLayer(ctx, entry)
  }

  /** 坐标轴层按面板共享：同一面板的多个实例只挂一个。 */
  private ensureScaleLayer(ctx: SubPaneContext, entry: ProjectedSubPaneEntry): void {
    if (this.scaleLayers.has(entry.paneId)) return
    if (ctx.getRenderer(entry.scaleLayerId)) {
      this.scaleLayers.set(entry.paneId, entry.scaleLayerId)
      return
    }
    const definition = getRegisteredIndicatorDefinition(entry.indicatorId)
    const opt = ctx.getOption()
    const axisWidth = opt.rightAxisWidth + (opt.priceLabelWidth ?? DEFAULT_PRICE_LABEL_WIDTH)
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
      getCrosshair,
    }
    const layer = definition?.scaleRendererFactory
      ? definition.scaleRendererFactory({ ...baseOptions, indicatorId: entry.indicatorId })
      : definition?.scale
        ? createIndicatorScaleLayer({
            ...baseOptions,
            indicatorKey: definition.scale.indicatorKey ?? definition.name,
            label: definition.scale.label ?? definition.displayName,
            decimals: definition.scale.decimals,
          })
        : null
    if (!layer) return
    ctx.useRenderer(layer)
    if (hasIndicatorScaleCrosshairLayer(layer)) ctx.useRenderer(layer.crosshairLayer)
    this.scaleLayers.set(entry.paneId, entry.scaleLayerId)
  }

  private unmount(ctx: SubPaneContext, entry: SubPaneResources): void {
    // removeRenderer 同步卸 Scene Layer 并触发 Layer.dispose；共享坐标轴层由 prune 处理。
    ctx.removeRenderer(entry.layerId)
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
