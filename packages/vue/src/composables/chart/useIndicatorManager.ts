/**
 * Manages indicator state for both main-pane and sub-pane indicators.
 * Provides pane layout construction, default param resolution,
 * indicator toggle/update/reorder logic. Indicator state is read directly
 * from Core controller signals; Vue keeps no business-state mirror.
 */
import type {
  ChartController,
  PaneSpec,
  IndicatorInstance,
  SubIndicatorType,
} from '@363045841yyt/klinechart-core/controllers'
import { getRegisteredIndicatorDefinition } from '@363045841yyt/klinechart-core/indicators'
import { computed, type Ref } from 'vue'

import { useControllerSignal } from './useControllerSignal'

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
  const subPanes = computed<SubPaneSlot[]>(() =>
    subPaneInfos.value.map((pane) => ({
      id: pane.paneId,
      indicatorId: pane.indicatorId as SubIndicatorType,
      params: { ...pane.params },
    })),
  )

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
    if (indicatorId === 'VOLUME') return {}
    const meta = getRegisteredIndicatorDefinition(indicatorId)
    if (meta?.runtime?.defaultConfig) {
      return { ...meta.runtime.defaultConfig } as Record<string, number | boolean | string>
    }
    return {}
  }

  function isSubPaneIndicator(id: string): boolean {
    if (id === 'VOLUME') return true
    const def = getRegisteredIndicatorDefinition(id)
    return !!def && def.category !== 'main'
  }

  function addSubPane(
    indicatorId: SubIndicatorType = 'VOLUME',
    params?: Record<string, number | boolean | string>,
  ): boolean {
    if (subPanes.value.length >= maxSubPanes) {
      return false
    }

    const mergedParams = params ?? getDefaultParams(indicatorId)

    const paneId = ctrl.value?.addIndicator(indicatorId, 'sub', mergedParams)
    if (!paneId) return false
    return true
  }

  function removeSubPane(paneId: string): void {
    ctrl.value?.removeIndicator(paneId)
  }

  function clearAllSubPanes(): void {
    for (const pane of subPanes.value) {
      ctrl.value?.removeIndicator(pane.id)
    }
  }

  function switchSubIndicator(paneId: string, newIndicatorId: SubIndicatorType): void {
    const nextParams = getDefaultParams(newIndicatorId)
    ctrl.value?.replaceSubPaneIndicator(paneId, newIndicatorId, nextParams)
  }

  function handleIndicatorToggle(indicatorId: string, active: boolean) {
    const c = ctrl.value
    if (!c) return

    const def = getRegisteredIndicatorDefinition(indicatorId)
    const isMain = def && (def.category === 'main' || def.allowMainPane)
    if (isMain) {
      const existingIndicator = mainActiveIndicators.value.find((id) => id === indicatorId)
      if (active && !existingIndicator) {
        c.addIndicator(indicatorId, 'main', indicatorParams.value[indicatorId])
      } else if (!active && existingIndicator) {
        c.removeIndicator(indicatorId.toUpperCase())
      }
      return
    }

    if (isSubPaneIndicator(indicatorId)) {
      if (active) {
        const existingPane = subPanes.value.find((p) => p.indicatorId === indicatorId)
        if (existingPane) return
        if (subPanes.value.length >= maxSubPanes) return

        const paneId = c.addIndicator(indicatorId, 'sub', indicatorParams.value[indicatorId])
        if (!paneId && subPanes.value.length > 0) {
          const lastPane = subPanes.value[subPanes.value.length - 1]
          switchSubIndicator(lastPane.id, indicatorId as SubIndicatorType)
        }
      } else {
        const panesToRemove = subPanes.value.filter((p) => p.indicatorId === indicatorId)
        panesToRemove.forEach((pane) => {
          c.removeIndicator(pane.id)
        })
      }
    }
  }

  function handleUpdateParams(indicatorId: string, params: Record<string, unknown>) {
    if (
      indicatorId === 'MA' ||
      indicatorId === 'BOLL' ||
      indicatorId === 'EXPMA' ||
      indicatorId === 'ENE'
    ) {
      ctrl.value?.updateIndicatorParams(indicatorId, params)
      return
    }
    if (isSubPaneIndicator(indicatorId)) {
      subPanes.value
        .filter((p) => p.indicatorId === indicatorId)
        .forEach((pane) => {
          ctrl.value?.updateIndicatorParams(pane.id, params)
        })
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
    c.updatePaneLayout([
      { id: 'main', ratio: paneRatiosRef.value['main'] ?? 3, visible: true, role: 'price' },
      ...nextSubPanes.map((pane) => ({
        id: pane.id,
        ratio: paneRatiosRef.value[pane.id] ?? 1,
        visible: true,
        role: 'indicator' as const,
      })),
    ])
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
    switchSubIndicator,
    handleIndicatorToggle,
    handleUpdateParams,
    handleReorderSubIndicators,
  }
}
