import { KLineChartError, SUBPANE_ERROR_CODES } from '../../../errors.js'
import { encodeStableNumber } from '../../../foundation/utils/stableNumber.js'
import type { Layer } from '../../../rendering/scene/types.js'
import {
  getRegisteredIndicatorDefinition,
  resolveIndicatorLayerId,
} from '../../indicators/indicatorDefinitionRegistry.js'
import { createIndicatorLayer } from '../../renderers/Indicator/factory.js'
import { findIndicator } from '../../renderers/Indicator/indicatorCatalog.js'
import { createIndicatorScaleLayer } from '../../renderers/Indicator/scale/indicator_scale.js'
import { createPaneTitleRendererLayer } from '../../renderers/paneTitle.js'
import type { SubPaneSpec } from '../../state/indicatorState.js'
import type { SubPaneContext, SubPaneResources } from '../types.js'
import { DEFAULT_PRICE_LABEL_WIDTH } from '../types.js'

type ProjectedSubPaneEntry = SubPaneSpec & SubPaneResources
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
        const nextProjectionKey = `${spec.indicatorId}:${spec.hidden ? 'hidden' : 'shown'}:${stableConfig(spec.params)}`
        if (current?.projectionKey === nextProjectionKey) continue

        if (candidate.hidden) {
          // 隐藏：卸载指标与坐标轴，只保留置灰标题，供再次点击恢复。
          if (current) this.unmount(ctx, current)
          this.mountPaneTitleRenderer(ctx, candidate)
        } else if (current?.hidden) {
          // 从隐藏恢复：全量重建，确保标题重新着色并挂回绘制与坐标轴。
          if (current) this.unmount(ctx, current)
          this.mount(ctx, candidate)
          this.mountPaneTitleRenderer(ctx, candidate)
        } else if (current?.rendererName === candidate.rendererName) {
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
          hidden: candidate.hidden === true,
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
    const { projectionKey: _, hidden: _hidden, ...snapshot } = resources
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
      layerId: resolveIndicatorLayerId(spec.indicatorId, spec.paneId),
      scaleLayerId: resolveIndicatorLayerId(spec.indicatorId, spec.paneId, 'scale'),
      paneTitleLayerId: resolveIndicatorLayerId(spec.indicatorId, spec.paneId, 'title'),
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
      })
      // useRenderer：唯一 Scene Layer
      ctx.useRenderer(layer)
    }
    this.mountScaleRenderer(ctx, entry)
  }

  private mountScaleRenderer(ctx: SubPaneContext, entry: ProjectedSubPaneEntry): void {
    if (ctx.getRenderer(entry.scaleLayerId)) {
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
      yPaddingPx: opt.yPaddingPx,
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
  }

  private mountPaneTitleRenderer(ctx: SubPaneContext, entry: ProjectedSubPaneEntry): void {
    if (ctx.getRenderer(entry.paneTitleLayerId)) {
      return
    }
    const layer = createPaneTitleRendererLayer({
      paneId: entry.paneId,
      title: findIndicator(entry.indicatorId)?.label ?? entry.indicatorId,
      indicatorId: entry.indicatorId,
      instanceId: entry.instanceId,
      hidden: entry.hidden === true,
      params: { ...entry.params },
    })
    ctx.useRenderer(layer)
  }

  private unmount(ctx: SubPaneContext, entry: SubPaneResources, preserveTitle = false): void {
    // removeRenderer 同步卸 Scene Layer 并触发 Layer.dispose
    ctx.removeRenderer(entry.layerId)
    ctx.removeRenderer(entry.scaleLayerId)
    if (!preserveTitle) {
      ctx.removeRenderer(entry.paneTitleLayerId)
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
