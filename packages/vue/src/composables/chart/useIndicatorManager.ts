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

  async function handleIndicatorToggle(indicatorId: string, active: boolean): Promise<void> {
    const controller = ctrl.value
    if (!controller) return

    // 角色判断只读静态目录；写入前才加载实现。
    const def = getIndicatorDescriptor(indicatorId)
    const isMain = def?.category === 'main'
    if (isMain) {
      const existing = controller.indicators
        .peek()
        .filter((item) => item.role === 'main' && item.definitionId === indicatorId)
      if (active && existing.length === 0) {
        const c = await loadIndicator(controller, indicatorId)
        if (!c) return
        c.addIndicator(indicatorId, indicatorParams.value[indicatorId])
      } else if (!active) {
        for (const instance of existing) controller.removeIndicator(instance.id)
      }
      return
    }

    if (isSubPaneIndicator(indicatorId)) {
      if (active) {
        const existingPane = subPanes.value.find((p) => p.indicatorId === indicatorId)
        if (existingPane) return
        if (subPanes.value.length >= maxSubPanes) return
        const loaded = await loadIndicator(controller, indicatorId)
        if (!loaded) return
        loaded.addIndicator(indicatorId, indicatorParams.value[indicatorId])
      } else {
        const panesToRemove = subPanes.value.filter((p) => p.indicatorId === indicatorId)
        panesToRemove.forEach((pane) => controller.removePane(pane.id))
      }
    }
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
