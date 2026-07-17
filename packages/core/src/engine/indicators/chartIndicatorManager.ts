import { KLineChartError } from '../../errors'
import type {
  PluginHostImpl,
  RendererPlugin,
  RendererPluginWithHost,
  RenderContext,
} from '../../foundation/plugin/index'
import {
  computed,
  effect,
  type ReadonlySignal,
  type Computed,
} from '../../foundation/reactivity/signal'
import type { IndicatorStateModule, MainIndicatorEntry } from '../state/indicatorState'
import type { SubPaneSpec } from '../state/subPaneState'
import type { Layer } from '../../rendering/scene/types'
import type { KLineData } from '../../foundation/types/price'
import type { IndicatorInstance, SubPaneInfo, PaneSpec, ChartOptions } from '../chartTypes'
import type { VisibleRange } from '../layout/pane'
import { UpdateLevel } from '../layout/pane'
import type { SubIndicatorType } from '../renderers/Indicator'
import { createMainIndicatorLegendRendererPlugin } from '../renderers/Indicator/mainIndicatorLegend'
import { SubPaneManager, type SubPaneEntry, type SubPaneContext } from '../subPaneManager'

import { getRegisteredIndicatorDefinitions } from './indicatorDefinitionRegistry'
import { IndicatorScheduler } from './scheduler'

type ResolvedChartOptions = Omit<ChartOptions, 'kWidth' | 'kGap'> & {
  kWidth: number
  kGap: number
}

function mainIndicatorProjectionKey(
  params: Readonly<Record<string, number | boolean | string>>,
): string {
  const valueKey = (value: number | boolean | string): string => {
    if (typeof value !== 'number') return `${typeof value}:${JSON.stringify(value)}`
    if (Number.isNaN(value)) return 'number:NaN'
    if (value === Number.POSITIVE_INFINITY) return 'number:Infinity'
    if (value === Number.NEGATIVE_INFINITY) return 'number:-Infinity'
    if (Object.is(value, -0)) return 'number:-0'
    return `number:${value}`
  }
  return Object.keys(params)
    .sort()
    .map((key) => `${key}:${valueKey(params[key]!)}`)
    .join('|')
}

/** 副图业务操作：create/remove/clear 会联动 pane 布局，不能只写 subPane 模块 */
export interface SubPaneOps {
  readonly entries: ReadonlySignal<ReadonlyArray<SubPaneSpec>>
  create: (
    paneId: string,
    indicatorId: string,
    params: Readonly<Record<string, unknown>>,
  ) => void
  remove: (paneId: string) => void
  replace: (
    paneId: string,
    indicatorId: string,
    params: Readonly<Record<string, unknown>>,
  ) => void
  setParams: (paneId: string, params: Readonly<Record<string, unknown>>) => void
  clear: () => void
}

export interface IndicatorDependencies {
  getOption: () => ResolvedChartOptions
  getPluginHost: () => PluginHostImpl
  getRenderer: <T extends RendererPlugin = RendererPlugin>(name: string) => T | undefined
  useRenderer: (
    plugin: RendererPlugin | RendererPluginWithHost,
    config?: Record<string, unknown>,
  ) => void
  removeRenderer: (name: string) => void
  updateRendererConfig: (name: string, config: Record<string, unknown>) => void
  setRendererEnabled: (name: string, enabled: boolean) => void
  getPaneRatiosSignal: () => ReadonlySignal<Readonly<Record<string, number>>>
  paneSpecs$: ReadonlySignal<ReadonlyArray<PaneSpec>>
  projectPaneLayout: (
    specs: ReadonlyArray<PaneSpec>,
    ratios: Readonly<Record<string, number>>,
  ) => void
  getLastVisibleRange: () => VisibleRange
  getCrosshairPos: () => { x: number; y: number } | null
  getCrosshairPrice: () => number | null
  getActivePaneId: () => string | null
  scheduleDraw: (level?: UpdateLevel) => void
  getRenderContext: (paneId: string) => RenderContext | null
  addLayer: (layer: Layer) => void
  removeLayer: (id: string) => boolean
  getLayer: (id: string) => Layer | null
  setLayerVisibility: (id: string, visible: boolean) => void
  getRightAxisWidth: () => number
  getPriceLabelWidth: () => number
  getYPaddingPx: () => number
  /** 主图指标状态模块 */
  indicator: IndicatorStateModule
  /** 副图状态 + 联动 pane 布局的复合操作 */
  subPaneOps: SubPaneOps
  runRendererTransaction: (run: () => void) => void
}

export class ChartIndicatorManager {
  private deps: IndicatorDependencies
  private indicatorScheduler: IndicatorScheduler
  private subPaneManager: SubPaneManager
  private _indicatorsComputed: Computed<ReadonlyArray<IndicatorInstance>>
  private _subPanesComputed: Computed<ReadonlyArray<SubPaneInfo>>
  private subPaneCtx: SubPaneContext
  private disposeProjection: (() => void) | null = null
  private appliedMainIndicators = new Map<string, string>()
  private projectedPaneSpecs: ReadonlyArray<PaneSpec> | null = null
  private projectedPaneRatios: Readonly<Record<string, number>> | null = null

  /** 主图指标默认参数（从注册表中懒加载） */
  private static _defaultMainParamsCache: Record<
    string,
    Record<string, number | boolean | string>
  > | null = null

  private static get DEFAULT_MAIN_PARAMS(): Record<
    string,
    Record<string, number | boolean | string>
  > {
    if (ChartIndicatorManager._defaultMainParamsCache === null) {
      ChartIndicatorManager._defaultMainParamsCache = {}
      for (const def of getRegisteredIndicatorDefinitions()) {
        if (def.category === 'main') {
          const key = def.name.toUpperCase()
          ChartIndicatorManager._defaultMainParamsCache[key] = (def.runtime?.defaultConfig ??
            {}) as Record<string, number | boolean | string>
        }
      }
    }
    return ChartIndicatorManager._defaultMainParamsCache
  }

  /** 可启用的主图指标白名单（从注册表中懒加载） */
  private static _enableMainIndicatorsCache: string[] | null = null

  private static get ENABLE_MAIN_INDICATORS(): string[] {
    if (ChartIndicatorManager._enableMainIndicatorsCache === null) {
      ChartIndicatorManager._enableMainIndicatorsCache = getRegisteredIndicatorDefinitions()
        .filter((d) => d.category === 'main')
        .map((d) => d.name.toUpperCase())
    }
    return ChartIndicatorManager._enableMainIndicatorsCache
  }

  /** 副图渲染器名称前缀（保留向后兼容） */
  static readonly SUB_PANE_PREFIX = 'sub_'

  constructor(deps: IndicatorDependencies) {
    this.deps = deps

    // 初始化指标调度器（IndicatorRegistry 构造时自动从全局 registry 同步）
    this.indicatorScheduler = new IndicatorScheduler()
    this.indicatorScheduler.setPluginHost(deps.getPluginHost())
    this.indicatorScheduler.setInvalidateCallback(() => {
      deps.scheduleDraw()
    })

    // 初始化副图管理器
    this.subPaneManager = new SubPaneManager()
    this.subPaneCtx = {
      ...this.deps,
      getIndicatorScheduler: () => this.indicatorScheduler,
    }

    // 注册副图活跃列表提供者
    this.indicatorScheduler.setActiveSubPaneProvider(() =>
      this.deps.subPaneOps.entries.peek().map((entry) => entry.paneId),
    )

    // 派生信号
    this._indicatorsComputed = computed<ReadonlyArray<IndicatorInstance>>(() => {
      const mainIndicators: IndicatorInstance[] = [...this.deps.indicator.readonly.mainIndicators().entries()].map(
        ([id, entry]) => ({
          id,
          definitionId: id,
          label: id,
          name: id,
          role: 'main' as const,
          params: { ...entry.params },
        }),
      )

      const subIndicators: IndicatorInstance[] = this.deps.subPaneOps.entries().map((entry) => ({
        id: entry.paneId,
        definitionId: entry.indicatorId,
        label: entry.indicatorId,
        name: entry.indicatorId,
        role: 'sub' as const,
        paneId: entry.paneId,
        params: { ...entry.params },
      }))

      return [...mainIndicators, ...subIndicators]
    })
    this._subPanesComputed = computed<ReadonlyArray<SubPaneInfo>>(() => {
      const ratios = deps.getPaneRatiosSignal()()
      return this.deps.subPaneOps.entries().map((entry) => ({
        paneId: entry.paneId,
        indicatorId: entry.indicatorId,
        params: { ...entry.params },
        ratio: ratios[entry.paneId] ?? 1,
      }))
    })

    // dev: 主副图状态变更日志
    if ((import.meta as any).env?.MODE !== 'production') {
      this._indicatorsComputed.subscribe(() => {
        const instances = this._indicatorsComputed.peek()
        console.log('[Chart] indicators signal changed:', instances)
      })
      this._subPanesComputed.subscribe(() => {
        const subPanes = this._subPanesComputed.peek()
        console.log('[Chart] subPanes signal changed:', subPanes)
      })
    }

    this.projectedPaneSpecs = this.deps.paneSpecs$.peek()
    this.projectedPaneRatios = this.deps.getPaneRatiosSignal().peek()
    this.disposeProjection = effect(() => {
      const paneSpecs = this.deps.paneSpecs$()
      const paneRatios = this.deps.getPaneRatiosSignal()()
      const mainIndicators = this.deps.indicator.readonly.mainIndicators()
      const subPanes = this.deps.subPaneOps.entries()
      this.deps.runRendererTransaction(() => {
        let paneChanged = false
        if (paneSpecs !== this.projectedPaneSpecs || paneRatios !== this.projectedPaneRatios) {
          this.deps.projectPaneLayout(paneSpecs, paneRatios)
          this.projectedPaneSpecs = paneSpecs
          this.projectedPaneRatios = paneRatios
          paneChanged = true
        }
        const mainChanged = this.reconcileMainIndicators(mainIndicators)
        const subChanged = this.subPaneManager.reconcile(this.subPaneCtx, subPanes)
        if (paneChanged || mainChanged || subChanged) this.deps.scheduleDraw()
      })
    })
  }

  get indicatorSchedulerAccessor(): IndicatorScheduler {
    return this.indicatorScheduler
  }

  get subPaneManagerAccessor(): SubPaneManager {
    return this.subPaneManager
  }

  get mainIndicatorsSignalPeek(): ReadonlyMap<string, MainIndicatorEntry> {
    return this.deps.indicator.readonly.mainIndicators.peek()
  }

  get indicatorsComputed(): Computed<ReadonlyArray<IndicatorInstance>> {
    return this._indicatorsComputed
  }

  get subPanesComputed(): Computed<ReadonlyArray<SubPaneInfo>> {
    return this._subPanesComputed
  }

  // ========== 主图指标 API ==========

  enableMainIndicator(
    indicatorId: string,
    params?: Record<string, number | boolean | string>,
  ): boolean {
    const id = indicatorId.toUpperCase()
    if (!ChartIndicatorManager.ENABLE_MAIN_INDICATORS.includes(id)) {
      console.warn(`[Chart] 未知的主图指标: ${indicatorId}`)
      return false
    }

    const existing = this.deps.indicator.readonly.mainIndicators.peek().get(id)

    if (existing) {
      if (params) {
        this.deps.indicator.actions.upsert(id, params)
      }
      return true
    }

    const defaults = ChartIndicatorManager.DEFAULT_MAIN_PARAMS[id] ?? {}
    const merged = params ? { ...defaults, ...params } : defaults
    this.deps.indicator.actions.upsert(id, merged)
    return true
  }

  disableMainIndicator(indicatorId: string): boolean {
    const id = indicatorId.toUpperCase()
    if (!this.deps.indicator.readonly.mainIndicators.peek().has(id)) return false

    this.deps.indicator.actions.remove(id)
    return true
  }

  toggleMainIndicator(indicatorId: string, enabled: boolean): void {
    if (enabled) {
      this.enableMainIndicator(indicatorId)
    } else {
      this.disableMainIndicator(indicatorId)
    }
  }

  getActiveMainIndicators(): string[] {
    return [...this.deps.indicator.readonly.mainIndicators.peek().keys()]
  }

  isMainIndicatorActive(indicatorId: string): boolean {
    return this.deps.indicator.readonly.mainIndicators.peek().has(indicatorId.toUpperCase())
  }

  updateMainIndicatorParams(
    indicatorId: string,
    params: Record<string, number | boolean | string>,
  ): void {
    const id = indicatorId.toUpperCase()
    if (!this.deps.indicator.readonly.mainIndicators.peek().has(id)) return

    this.deps.indicator.actions.setParams(id, params)
  }

  getMainIndicatorParams(indicatorId: string): Record<string, number | boolean | string> | null {
    const params = this.deps.indicator.readonly.mainIndicators.peek().get(indicatorId.toUpperCase())?.params
    return params ? { ...params } : null
  }

  clearMainIndicators(): void {
    this.deps.indicator.actions.clear()
  }

  private reconcileMainIndicators(desired: ReadonlyMap<string, MainIndicatorEntry>): boolean {
    let changed = false
    for (const id of [...this.appliedMainIndicators.keys()]) {
      if (desired.has(id)) continue
      this.disableMainIndicatorRenderer(id)
      this.appliedMainIndicators.delete(id)
      this.updateIndicatorSchedulerConfig(id)
      changed = true
    }
    for (const [id, entry] of desired) {
      const hasApplied = this.appliedMainIndicators.has(id)
      const projectionKey = mainIndicatorProjectionKey(entry.params)
      if (this.appliedMainIndicators.get(id) === projectionKey) continue
      try {
        if (!hasApplied) this.enableMainIndicatorRenderer(id)
        const rendererName =
          this.indicatorScheduler.getIndicatorMetadata(id)?.mainPane?.rendererName
        if (rendererName) this.deps.updateRendererConfig(rendererName, { ...entry.params })
        this.updateIndicatorSchedulerConfig(id)
        this.appliedMainIndicators.set(id, projectionKey)
        changed = true
      } catch (error) {
        console.error(`[ChartIndicatorManager] Failed to project main indicator "${id}":`, error)
      }
    }
    return changed
  }

  private enableMainIndicatorRenderer(indicatorId: string): void {
    const definition = this.indicatorScheduler.getIndicatorMetadata(indicatorId)
    const mainPane = definition?.mainPane
    if (!definition || !mainPane) return

    const rendererName = mainPane.rendererName
    const layerId = `plugin:${rendererName}`
    const existingLayer = this.deps.getLayer(layerId)

    if (!existingLayer) {
      const plugin = definition.rendererFactory({ paneId: 'main', indicatorId })
      // useRenderer：注册表 + 唯一 Scene Layer
      this.deps.useRenderer(plugin)
    }

    this.deps.setLayerVisibility(layerId, true)

    // core 可能已挂 legend Layer 且未进 Manager；两者任一存在都不再注册第二实例
    if (
      !this.deps.getLayer('plugin:mainIndicatorLegend') &&
      !this.deps.getRenderer('mainIndicatorLegend')
    ) {
      const legend = createMainIndicatorLegendRendererPlugin({
        yPaddingPx: this.deps.getOption().yPaddingPx,
      })
      this.deps.useRenderer(legend)
    }
  }

  private disableMainIndicatorRenderer(indicatorId: string): void {
    const rendererName =
      this.indicatorScheduler.getIndicatorMetadata(indicatorId)?.mainPane?.rendererName
    if (rendererName) {
      this.deps.setRendererEnabled(rendererName, false)
    }
  }

  private updateIndicatorSchedulerConfig(indicatorId: string): void {
    const entry = this.deps.indicator.readonly.mainIndicators.peek().get(indicatorId)
    const isActive = entry !== undefined
    const params = entry?.params ?? {}

    const definition = this.indicatorScheduler.getIndicatorMetadata(indicatorId)
    const toActiveConfig = definition?.mainPane?.toActiveConfig
    if (!definition?.updateConfig || !toActiveConfig) return

    const config = toActiveConfig(params, isActive)
    if (config !== null) {
      definition.updateConfig(this.indicatorScheduler, config, 'main')
    }
  }

  /**
   * @deprecated 使用 enableMainIndicator/disableMainIndicator 替代
   * 状态一次 replaceAll，再做 renderer side effects，避免逐条中间态。
   */
  setActiveMainIndicators(indicators: string[]): void {
    const newIds = indicators
      .map((i) => i.toUpperCase())
      .filter((id) => ChartIndicatorManager.ENABLE_MAIN_INDICATORS.includes(id))
    const prev = this.deps.indicator.readonly.mainIndicators.peek()

    const next = new Map<string, MainIndicatorEntry>()
    for (const id of newIds) {
      const existing = prev.get(id)
      if (existing) {
        next.set(id, { params: { ...existing.params } })
      } else {
        next.set(id, {
          params: { ...(ChartIndicatorManager.DEFAULT_MAIN_PARAMS[id] ?? {}) },
        })
      }
    }
    this.deps.indicator.actions.replaceAll(next)
  }

  // ========== 副图管理 API ==========

  bindIndicatorToPane(
    paneId: string,
    indicatorId: SubIndicatorType,
    params?: Record<string, number | boolean | string>,
  ): void {
    const definition = this.indicatorScheduler.getIndicatorMetadata(indicatorId)
    if (!definition) {
      throw new KLineChartError('NOT_REGISTERED', `[Chart] Unknown indicator: ${indicatorId}`)
    }
    this.deps.subPaneOps.create(
      paneId,
      indicatorId,
      params ?? this.getDefaultSubPaneParams(indicatorId),
    )
  }

  createSubPane(
    paneId: string,
    indicatorId: SubIndicatorType,
    params?: Record<string, number | boolean | string>,
  ): boolean {
    const existing = this.deps.subPaneOps.entries.peek().find((entry) => entry.paneId === paneId)
    if (existing) {
      if (
        existing.indicatorId === indicatorId &&
        !this.subPaneManager.getMountedResources(paneId)
      ) {
        this.deps.subPaneOps.replace(
          paneId,
          existing.indicatorId,
          existing.params,
        )
      }
      return true
    }
    if (!this.indicatorScheduler.getIndicatorMetadata(indicatorId)) {
      throw new KLineChartError('NOT_REGISTERED', `[Chart] Unknown indicator: ${indicatorId}`)
    }
    this.deps.subPaneOps.create(
      paneId,
      indicatorId,
      params ?? this.getDefaultSubPaneParams(indicatorId),
    )
    return true
  }

  removeSubPane(paneId: string): void {
    this.deps.subPaneOps.remove(paneId)
  }

  replaceSubPaneIndicator(
    paneId: string,
    newIndicatorId: SubIndicatorType,
    params?: Record<string, number | boolean | string>,
  ): void {
    if (!this.indicatorScheduler.getIndicatorMetadata(newIndicatorId)) {
      throw new KLineChartError('NOT_REGISTERED', `[Chart] Unknown indicator: ${newIndicatorId}`)
    }
    this.deps.subPaneOps.replace(
      paneId,
      newIndicatorId,
      params ?? this.getDefaultSubPaneParams(newIndicatorId),
    )
  }

  updateSubPaneParams(paneId: string, params: Record<string, unknown>): void {
    this.deps.subPaneOps.setParams(paneId, params)
  }

  clearSubPanes(): void {
    this.deps.subPaneOps.clear()
  }

  /**
   * @deprecated 使用 getSubPaneEntries 获取完整信息
   */
  getSubPaneIndicators(): SubIndicatorType[] {
    return this.deps.subPaneOps.entries.peek().map((entry) => entry.indicatorId)
  }

  getSubPaneEntries(): SubPaneEntry[] {
    return this.deps.subPaneOps.entries.peek().map((entry) => ({
      ...entry,
      params: { ...entry.params },
      ...this.subPaneManager.getMountedResources(entry.paneId),
    }))
  }

  getSubPaneEntry(paneId: string): SubPaneEntry | undefined {
    const entry = this.deps.subPaneOps.entries.peek().find((candidate) => candidate.paneId === paneId)
    if (!entry) return undefined
    return {
      ...entry,
      params: { ...entry.params },
      ...this.subPaneManager.getMountedResources(paneId),
    }
  }

  private getDefaultSubPaneParams(indicatorId: SubIndicatorType): Record<string, unknown> {
    const meta = this.indicatorScheduler.getIndicatorMetadata(indicatorId)
    return { ...((meta?.runtime?.defaultConfig as Record<string, unknown>) ?? {}) }
  }

  // ========== 高层指标 API ==========

  addIndicator(
    definitionId: string,
    role: 'main' | 'sub',
    params?: Record<string, unknown>,
  ): string | null {
    if (role === 'main') {
      const success = this.enableMainIndicator(
        definitionId,
        params as Record<string, number | boolean | string>,
      )
      if (!success) return null
      return definitionId.toUpperCase()
    } else {
      const paneId = `${definitionId.toUpperCase()}_${Date.now()}`
      const success = this.createSubPane(
        paneId,
        definitionId as SubIndicatorType,
        params as Record<string, number | boolean | string>,
      )
      if (!success) return null
      return paneId
    }
  }

  removeIndicator(instanceId: string): boolean {
    const id = instanceId.toUpperCase()

    if (this.deps.indicator.readonly.mainIndicators.peek().has(id)) {
      return this.disableMainIndicator(instanceId)
    }

    const subPaneEntry = this.getSubPaneEntry(instanceId)
    if (subPaneEntry) {
      this.removeSubPane(instanceId)
      return true
    }

    return false
  }

  updateIndicatorParams(instanceId: string, params: Record<string, unknown>): boolean {
    const id = instanceId.toUpperCase()

    if (this.deps.indicator.readonly.mainIndicators.peek().has(id)) {
      this.updateMainIndicatorParams(
        instanceId,
        params as Record<string, number | boolean | string>,
      )
      return true
    }

    const subPaneEntry = this.getSubPaneEntry(instanceId)
    if (subPaneEntry) {
      this.updateSubPaneParams(instanceId, params)
      return true
    }

    return false
  }

  reorderIndicators(orderedInstanceIds: string[]): boolean {
    console.warn('[Chart] reorderIndicators not fully implemented yet')
    return false
  }

  destroy(): void {
    this.disposeProjection?.()
    this.disposeProjection = null
    this.deps.runRendererTransaction(() => this.subPaneManager.clear(this.subPaneCtx))
    this.indicatorScheduler.destroy()
  }
}
