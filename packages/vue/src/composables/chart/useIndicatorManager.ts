/**
 * Manages indicator state for both main-pane and sub-pane indicators.
 * Provides pane layout construction, default param resolution,
 * indicator toggle/update/reorder logic, and bridges signal subscriptions
 * (ctrl.indicators, ctrl.subPanes) to Vue reactive refs.
 */
import { ref, computed, type Ref } from 'vue'
import type {
  ChartController,
  PaneSpec,
  IndicatorInstance,
  SubIndicatorType,
} from '@363045841yyt/klinechart-core/controllers'
import { getRegisteredIndicatorDefinition } from '@363045841yyt/klinechart-core/indicators'
import type { SemanticChartConfig } from '@363045841yyt/klinechart-core/semantic'

interface SubPaneSlot {
  id: string
  indicatorId: SubIndicatorType
  params: Record<string, unknown>
}

export function useIndicatorManager(
  ctrl: Ref<ChartController | null>,
  paneRatiosRef: Ref<Record<string, number>>,
) {
  const maxSubPanes = 4

  const mainActiveIndicators = ref<string[]>([])

  const subPanes = ref<SubPaneSlot[]>([])

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

  const indicatorParams = ref<Record<string, Record<string, unknown>>>({})

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

  function initIndicatorsFromConfig(semanticConfig?: SemanticChartConfig): void {
    const config = semanticConfig
    const c = ctrl.value
    if (!config || !c) return

    const mainIndicators = config.indicators?.main
    if (mainIndicators) {
      for (const indicator of mainIndicators) {
        if (indicator.enabled) {
          c.addIndicator(
            indicator.type,
            'main',
            indicator.params as Record<string, number | boolean | string>,
          )
        }
      }
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

    subPanes.value = nextSubPanes

    const c = ctrl.value
    if (!c) return
    c.updatePaneLayout(buildPaneLayoutIntent())
  }

  function setupIndicatorSubscriptions(chartCtrl: ChartController): () => void {
    const unsubIndicators = chartCtrl.indicators.subscribe(() => {
      const instances = chartCtrl.indicators.peek()

      const mains = instances
        .filter((i): i is IndicatorInstance & { role: 'main' } => i.role === 'main')
        .map((i) => i.definitionId)
      mainActiveIndicators.value = mains

      const nextParams = { ...indicatorParams.value }
      for (const inst of instances) {
        if (inst.role === 'main' && inst.params && Object.keys(inst.params).length > 0) {
          nextParams[inst.definitionId] = { ...inst.params }
        }
      }

      chartCtrl.updateRendererConfig('mainIndicatorLegend', {
        indicators: {
          MA: { enabled: mains.includes('MA'), params: nextParams['MA'] || {} },
          BOLL: { enabled: mains.includes('BOLL'), params: nextParams['BOLL'] || {} },
          EXPMA: { enabled: mains.includes('EXPMA'), params: nextParams['EXPMA'] || {} },
          ENE: { enabled: mains.includes('ENE'), params: nextParams['ENE'] || {} },
        },
      })

      indicatorParams.value = nextParams
    })

    const unsubSubPanes = chartCtrl.subPanes.subscribe(() => {
      const subPaneInfos = chartCtrl.subPanes.peek()
      const signalIds = new Set(subPaneInfos.map((sp) => sp.paneId))

      const merged = subPanes.value.filter((p) => signalIds.has(p.id))
      const existingIds = new Set(merged.map((p) => p.id))
      for (const sp of subPaneInfos) {
        if (!existingIds.has(sp.paneId)) {
          merged.push({
            id: sp.paneId,
            indicatorId: sp.indicatorId as SubIndicatorType,
            params: sp.params,
          })
        }
      }
      subPanes.value = merged

      const nextParams = { ...indicatorParams.value }
      for (const sp of subPaneInfos) {
        if (sp.params && Object.keys(sp.params).length > 0) {
          nextParams[sp.indicatorId] = { ...sp.params }
        }
      }
      indicatorParams.value = nextParams
    })

    return () => {
      unsubIndicators()
      unsubSubPanes()
    }
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
    initIndicatorsFromConfig,
    switchSubIndicator,
    handleIndicatorToggle,
    handleUpdateParams,
    handleReorderSubIndicators,
    setupIndicatorSubscriptions,
  }
}
