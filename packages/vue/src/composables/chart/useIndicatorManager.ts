/**
 * Manages indicator state for both main-pane and sub-pane indicators.
 * Provides pane layout construction, default param resolution,
 * indicator toggle/update/reorder logic. Indicator state is read directly
 * from Core controller signals; Vue keeps no business-state mirror.
 */
import type {
  ChartController,
  IndicatorInstance,
  PaneSpec,
  SubIndicatorType,
} from '@363045841yyt/klinechart-core/controllers'
import { getIndicatorDescriptor } from '@363045841yyt/klinechart-core/indicators'
import { computed, type Ref } from 'vue'

import { useControllerSignal } from './useControllerSignal.js'

interface SubPaneSlot {
  id: string
  indicatorId: SubIndicatorType
  params: Record<string, unknown>
}

/**
 * 添加指标前预加载的历史页数。
 *
 * 一页 500 根；10 页约 5000 根，够缠论这类结构指标在小级别图上成型。
 * 先补历史再建实例，避免首帧结构残缺后反复重算。
 */
const PRELOAD_HISTORY_PAGES = 10

export function useIndicatorManager(
  ctrl: Ref<ChartController | null>,
  paneRatiosRef: Readonly<Ref<Readonly<Record<string, number>>>>,
) {
  const maxSubPanes = 4

  const indicatorInstances = useControllerSignal(
    ctrl,
    (controller) => controller.indicators,
    () => [],
  )
  const subPaneInfos = useControllerSignal(
    ctrl,
    (controller) => controller.subPanes,
    () => [],
  )

  const mainActiveIndicators = computed(() =>
    indicatorInstances.value
      .filter(
        (indicator): indicator is IndicatorInstance & { role: 'main' } => indicator.role === 'main',
      )
      .map((indicator) => indicator.definitionId),
  )
  const subPanes = computed<SubPaneSlot[]>(() => {
    const byPane = new Map<string, SubPaneSlot>()
    for (const instance of subPaneInfos.value) {
      if (byPane.has(instance.paneId)) continue
      byPane.set(instance.paneId, {
        id: instance.paneId,
        indicatorId: instance.indicatorId as SubIndicatorType,
        params: { ...instance.params },
      })
    }
    return [...byPane.values()]
  })

  const subActiveIndicators = computed(() => {
    const ids: string[] = []
    const seen = new Set<string>()
    for (const pane of subPanes.value) {
      if (!seen.has(pane.indicatorId)) {
        seen.add(pane.indicatorId)
        ids.push(pane.indicatorId)
      }
    }
    return ids
  })

  const activeIndicators = computed(() => [
    ...mainActiveIndicators.value,
    ...subActiveIndicators.value,
  ])

  const indicatorParams = computed<Record<string, Record<string, unknown>>>(() => {
    const params: Record<string, Record<string, unknown>> = {}
    for (const indicator of indicatorInstances.value) {
      if (indicator.params && Object.keys(indicator.params).length > 0) {
        params[indicator.definitionId] = { ...indicator.params }
      }
    }
    for (const pane of subPaneInfos.value) {
      if (pane.params && Object.keys(pane.params).length > 0) {
        params[pane.indicatorId] = { ...pane.params }
      }
    }
    return params
  })

  function buildPaneLayoutIntent(): PaneSpec[] {
    const mainRatio = paneRatiosRef.value['main'] ?? 3
    return subPanes.value.length === 0
      ? [{ id: 'main', ratio: mainRatio, visible: true, role: 'price' }]
      : [
          { id: 'main', ratio: mainRatio, visible: true, role: 'price' },
          ...subPanes.value.map((pane) => ({
            id: pane.id,
            ratio: paneRatiosRef.value[pane.id] ?? 1,
            visible: true,
            role: 'indicator' as const,
          })),
        ]
  }

  function getDefaultParams(
    indicatorId: SubIndicatorType,
  ): Record<string, number | boolean | string> {
    // 静态目录即可给出默认参数，无需加载指标实现。
    const defaults = getIndicatorDescriptor(indicatorId)?.defaultParams
    return defaults ? ({ ...defaults } as Record<string, number | boolean | string>) : {}
  }

  function isSubPaneIndicator(id: string): boolean {
    const def = getIndicatorDescriptor(id)
    return !!def && def.category !== 'main'
  }

  /** 指标实现按需加载：写入状态前先加载该指标自身的模块。 */
  async function loadIndicator(
    controller: ChartController,
    indicatorId: string,
  ): Promise<ChartController | null> {
    await controller.loadIndicators([indicatorId])
    // 加载期间图表可能已被替换或销毁。
    return ctrl.value === controller ? controller : null
  }

  async function addSubPane(
    indicatorId: SubIndicatorType,
    params?: Record<string, number | boolean | string>,
  ): Promise<boolean> {
    const controller = ctrl.value
    if (!controller || subPanes.value.length >= maxSubPanes) {
      return false
    }

    const mergedParams = params ?? getDefaultParams(indicatorId)
    const loaded = await loadIndicator(controller, indicatorId)
    if (!loaded || subPanes.value.length >= maxSubPanes) return false
    return loaded.addIndicator(indicatorId, mergedParams) !== null
  }

  function removeSubPane(paneId: string): void {
    ctrl.value?.removePane(paneId)
  }

  function clearAllSubPanes(): void {
    for (const pane of subPanes.value) {
      ctrl.value?.removePane(pane.id)
    }
  }

  function clearAllIndicators(): void {
    const c = ctrl.value
    if (!c) return
    for (const id of mainActiveIndicators.value) c.removeIndicator(id)
    clearAllSubPanes()
  }

  async function switchSubIndicator(
    paneId: string,
    newIndicatorId: SubIndicatorType,
  ): Promise<void> {
    const controller = ctrl.value
    if (!controller) return
    const instance = controller.indicators.peek().find((item) => item.paneId === paneId)
    if (!instance) return
    const nextParams = getDefaultParams(newIndicatorId)
    const loaded = await loadIndicator(controller, newIndicatorId)
    loaded?.updateIndicator(instance.id, { indicatorId: newIndicatorId, params: nextParams })
  }

  /** 在副图序列中移动一个 Pane；主图始终固定在第 0 位。 */
  function moveSubPane(paneId: string, direction: 'up' | 'down'): void {
    const index = subPanes.value.findIndex((pane) => pane.id === paneId)
    const target = direction === 'up' ? index - 1 : index + 1
    if (index < 0 || target < 0 || target >= subPanes.value.length) return
    ctrl.value?.movePane(paneId, target + 1)
  }

  /** 该定义当前的全部实例，不区分实例落在哪个面板。 */
  function instancesOf(controller: ChartController, indicatorId: string): IndicatorInstance[] {
    return controller.indicators.peek().filter((item) => item.definitionId === indicatorId)
  }

  /**
   * 开关指标：关闭时删除该定义的全部实例，不区分当前归属；打开时按定义声明新建实例。
   *
   * 归属只按实例删，不按 role 或副图列表过滤：实例的 pane 可能来自旧版本存档
   * （脚本把 position 从副图改成主图后，老实例仍留在副图、role 仍是 sub），
   * 按 role 过滤会漏掉它，开关就永远关不掉，这个指标也再也回不到声明的主图。
   * 空副图由实例删除一并回收，不需要单独的 removePane。
   */
  async function handleIndicatorToggle(indicatorId: string, active: boolean): Promise<void> {
    const controller = ctrl.value
    if (!controller) return

    const instances = instancesOf(controller, indicatorId)
    if (!active) {
      for (const instance of instances) controller.removeIndicator(instance.id)
      return
    }
    // 已有实例就保持原样；它若落在别的面板，先关再开一次即可按声明重建。
    if (instances.length > 0) return

    // 角色判断只读静态目录；写入前才加载实现。
    const isMain = getIndicatorDescriptor(indicatorId)?.category === 'main'
    if (!isMain) {
      if (!isSubPaneIndicator(indicatorId)) return
      if (subPanes.value.length >= maxSubPanes) return
    }
    await controller.preloadHistory(PRELOAD_HISTORY_PAGES)
    const loaded = await loadIndicator(controller, indicatorId)
    if (!loaded) return
    loaded.addIndicator(indicatorId, indicatorParams.value[indicatorId])
  }

  /** 将参数设置提交到全部匹配实例；主图与副图都按实例身份写入。 */
  function handleUpdateParams(indicatorId: string, params: Record<string, unknown>) {
    const controller = ctrl.value
    if (!controller) return
    for (const instance of controller.indicators.peek()) {
      if (instance.definitionId !== indicatorId) continue
      controller.updateIndicator(instance.id, { params })
    }
  }

  function handleReorderSubIndicators(orderedIndicatorIds: string[]) {
    if (!orderedIndicatorIds.length || subPanes.value.length <= 1) return

    const validOrder = orderedIndicatorIds.filter((id): id is SubIndicatorType =>
      isSubPaneIndicator(id),
    )
    if (!validOrder.length) return

    const paneByIndicator = new Map(subPanes.value.map((pane) => [pane.indicatorId, pane] as const))
    const nextSubPanes: SubPaneSlot[] = []

    for (const indicatorId of validOrder) {
      const pane = paneByIndicator.get(indicatorId)
      if (pane) {
        nextSubPanes.push(pane)
        paneByIndicator.delete(indicatorId)
      }
    }

    if (nextSubPanes.length === 0) return

    for (const pane of subPanes.value) {
      if (paneByIndicator.has(pane.indicatorId)) {
        nextSubPanes.push(pane)
        paneByIndicator.delete(pane.indicatorId)
      }
    }

    const currentSubIds = subPanes.value.map((p) => p.id)
    const nextSubIds = nextSubPanes.map((p) => p.id)
    if (currentSubIds.join('|') === nextSubIds.join('|')) return

    const c = ctrl.value
    if (!c) return
    nextSubPanes.forEach((pane, index) => {
      c.movePane(pane.id, index + 1)
    })
  }

  return {
    mainActiveIndicators,
    subActiveIndicators,
    activeIndicators,
    indicatorParams,
    subPanes,
    maxSubPanes,
    buildPaneLayoutIntent,
    getDefaultParams,
    isSubPaneIndicator,
    addSubPane,
    removeSubPane,
    clearAllSubPanes,
    clearAllIndicators,
    switchSubIndicator,
    moveSubPane,
    handleIndicatorToggle,
    handleUpdateParams,
    handleReorderSubIndicators,
  }
}
