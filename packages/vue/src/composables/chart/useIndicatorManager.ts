/** 指标 UI 只投影 Core 实例与容器；开关按定义、编辑按实例、布局按 paneId 寻址。 */
import {
  type ChartController,
  INDICATOR_ROLE,
  type SubIndicatorType,
} from '@363045841yyt/klinechart-core/controllers'
import { getIndicatorDescriptor } from '@363045841yyt/klinechart-core/indicators'
import { computed, type Ref } from 'vue'
import { useControllerSignal } from './useControllerSignal.js'

/** 保留所有实例，仅从 Core 配置读取容器身份和顺序。 */
export function useIndicatorManager(ctrl: Ref<ChartController | null>) {
  const maxSubPanes = 4
  const indicatorInstances = useControllerSignal(
    ctrl,
    (controller) => controller.indicators,
    () => [],
  )
  const paneLayout = useControllerSignal(
    ctrl,
    (controller) => controller.paneLayout,
    () => [],
  )
  const mainActiveIndicators = computed(() => [
    ...new Set(
      indicatorInstances.value
        .filter((instance) => instance.role === INDICATOR_ROLE.MAIN)
        .map((instance) => instance.definitionId),
    ),
  ])
  const subActiveIndicators = computed(() => [
    ...new Set(
      indicatorInstances.value
        .filter((instance) => instance.role === INDICATOR_ROLE.SUB)
        .map((instance) => instance.definitionId),
    ),
  ])
  const activeIndicators = computed(() => [
    ...new Set(indicatorInstances.value.map((instance) => instance.definitionId)),
  ])
  const subPanes = computed(() =>
    paneLayout.value.flatMap((pane) => {
      const instances = indicatorInstances.value.filter(
        (instance) => instance.role === INDICATOR_ROLE.SUB && instance.paneId === pane.id,
      )
      return instances.length > 0 ? [{ id: pane.id, instances }] : []
    }),
  )
  const indicatorParams = computed<Record<string, Record<string, unknown>>>(() => {
    const params: Record<string, Record<string, unknown>> = {}
    for (const instance of indicatorInstances.value)
      params[instance.definitionId] = { ...instance.params }
    return params
  })

  /** 创建入口读取目录默认值，已有实例参数不会被布局逻辑重新解释。 */
  function getDefaultParams(indicatorId: SubIndicatorType): Record<string, unknown> {
    return { ...getIndicatorDescriptor(indicatorId)?.defaultParams }
  }

  /** 目录类别仅决定默认创建位置，不决定实例当前归属。 */
  function isSubPaneIndicator(id: string): boolean {
    const definition = getIndicatorDescriptor(id)
    return definition !== undefined && definition.category !== 'main'
  }

  /** 加载期间控制器可能替换或销毁，完成后必须重新确认接收者。 */
  async function loadIndicator(
    controller: ChartController,
    indicatorId: string,
  ): Promise<ChartController | null> {
    await controller.loadIndicators([indicatorId])
    return ctrl.value === controller ? controller : null
  }

  /** 用户主动添加副图，保留现有四副图的 UI 限制。 */
  async function addSubPane(
    indicatorId: SubIndicatorType,
    params?: Record<string, number | boolean | string>,
  ): Promise<boolean> {
    const controller = ctrl.value
    if (!controller || subPanes.value.length >= maxSubPanes) return false
    const loaded = await loadIndicator(controller, indicatorId)
    if (!loaded || subPanes.value.length >= maxSubPanes) return false
    return loaded.addIndicator(indicatorId, params ?? getDefaultParams(indicatorId)) !== null
  }

  /** 明确删除容器及其全部内容。 */
  function removeSubPane(paneId: string): void {
    ctrl.value?.removePane(paneId)
  }

  /** 清空副图由领域命令一次提交，不发布逐个删除的中间状态。 */
  function clearAllSubPanes(): void {
    ctrl.value?.clearPanes()
  }

  /** 清空全部用户指标。 */
  function clearAllIndicators(): void {
    ctrl.value?.clearAllIndicators()
  }

  /** 更换明确指定的指标实例；合并 pane 中其它实例保持不变。 */
  async function switchSubIndicator(
    instanceId: string,
    newIndicatorId: SubIndicatorType,
  ): Promise<void> {
    const controller = ctrl.value
    if (!controller) return
    const loaded = await loadIndicator(controller, newIndicatorId)
    loaded?.updateIndicator(instanceId, {
      indicatorId: newIndicatorId,
      params: getDefaultParams(newIndicatorId),
    })
  }

  /** 交换两个副图槽位，主图和系统容器保持当前位置，不假定主图索引为零。 */
  function moveSubPane(paneId: string, direction: 'up' | 'down'): void {
    const controller = ctrl.value
    const index = subPanes.value.findIndex((pane) => pane.id === paneId)
    const target = direction === 'up' ? index - 1 : index + 1
    const other = subPanes.value[target]
    if (!controller || index < 0 || !other) return
    const ids = controller.paneLayout.peek().map((pane) => pane.id)
    const from = ids.indexOf(paneId)
    const to = ids.indexOf(other.id)
    if (from < 0 || to < 0) return
    ;[ids[from], ids[to]] = [ids[to]!, ids[from]!]
    controller.reorderPanes(ids)
  }

  /** 定义开关查看全部实例；关闭只删除匹配定义，不删除其它指标所在的容器。 */
  async function handleIndicatorToggle(indicatorId: string, active: boolean): Promise<void> {
    const controller = ctrl.value
    if (!controller) return
    if (!active) {
      controller.removeIndicatorsByDefinition(indicatorId)
      return
    }
    if (
      !getIndicatorDescriptor(indicatorId) ||
      controller.indicators.peek().some((instance) => instance.definitionId === indicatorId)
    )
      return
    if (isSubPaneIndicator(indicatorId) && subPanes.value.length >= maxSubPanes) return
    const loaded = await loadIndicator(controller, indicatorId)
    if (
      !loaded ||
      loaded.indicators.peek().some((instance) => instance.definitionId === indicatorId) ||
      (isSubPaneIndicator(indicatorId) && subPanes.value.length >= maxSubPanes)
    )
      return
    loaded.addIndicator(indicatorId, indicatorParams.value[indicatorId])
  }

  /** 目录参数设置适用于该定义的全部实例，逐实例身份提交。 */
  function handleUpdateParams(indicatorId: string, params: Record<string, unknown>): void {
    const controller = ctrl.value
    if (!controller) return
    for (const instance of controller.indicators.peek()) {
      if (instance.definitionId === indicatorId) controller.updateIndicator(instance.id, { params })
    }
  }

  return {
    mainActiveIndicators,
    subActiveIndicators,
    activeIndicators,
    indicatorParams,
    subPanes,
    maxSubPanes,
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
  }
}
