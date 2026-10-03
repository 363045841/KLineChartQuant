/** 框架只处理 Legend 低频按钮操作，文本和数值更新全部留在 Core DOM renderer。 */
import {
  type ChartController,
  LEGEND_ACTION_EVENT,
  type LegendActionDetail,
} from '@363045841yyt/klinechart-core/controllers'
import { type Ref, ref, watch } from 'vue'

/** 连接 DOM 操作事件与指标选择器、Pane 和主图指标 API。 */
export function useLegendActions(
  controller: Ref<ChartController | null>,
  canvasLayer: Ref<HTMLElement | null>,
  options: {
    removePane: (paneId: string) => void
    movePane: (paneId: string, direction: 'up' | 'down') => void
    replacePane: (paneId: string, definitionId: string) => void
    openSelector: () => void
    openIndicatorSettings: (definitionId: string) => void
  },
) {
  const replacementId = ref<string | null>(null)
  const replacementRole = ref<'main' | 'sub'>('sub')

  watch(
    canvasLayer,
    (layer, _previous, onCleanup) => {
      if (!layer) return
      /** DOM renderer 的事件数据按公开契约校验，随后执行相应领域操作。 */
      function onAction(event: Event): void {
        if (!(event instanceof CustomEvent)) return
        const detail: unknown = event.detail
        if (!isLegendAction(detail)) return
        const { paneId, definitionId, action } = detail
        const main = paneId === 'main'
        if (action === 'replace') {
          replacementId.value = main ? definitionId : paneId
          replacementRole.value = main ? 'main' : 'sub'
          options.openSelector()
        } else if (action === 'close') {
          if (main) controller.value?.removeIndicator(definitionId)
          else options.removePane(paneId)
        } else if (action === 'toggle-visibility') {
          const hidden = detail.hidden === true
          if (main) controller.value?.setMainIndicatorHidden(definitionId, hidden)
          else controller.value?.setSubIndicatorHidden(paneId, hidden)
        } else if (action === 'settings') {
          options.openIndicatorSettings(definitionId)
        } else {
          const direction = action === 'move-up' ? 'up' : 'down'
          if (main) controller.value?.moveMainIndicator(definitionId, direction)
          else options.movePane(paneId, direction)
        }
      }
      layer.addEventListener(LEGEND_ACTION_EVENT, onAction)
      onCleanup(() => layer.removeEventListener(LEGEND_ACTION_EVENT, onAction))
    },
    { immediate: true, flush: 'post' },
  )

  /** 将选择器结果交给原位置对应的领域 API。 */
  function replaceLegend(id: string, definitionId: string): void {
    if (replacementRole.value === 'main') controller.value?.replaceMainIndicator(id, definitionId)
    else options.replacePane(id, definitionId)
    replacementId.value = null
  }
  return { replacementId, replacementRole, replaceLegend }
}

/** 校验自定义 DOM 事件的动作及指标身份。 */
function isLegendAction(value: unknown): value is LegendActionDetail {
  if (!value || typeof value !== 'object') return false
  return (
    'action' in value &&
    ['move-up', 'move-down', 'replace', 'toggle-visibility', 'settings', 'close'].includes(
      String(value.action),
    ) &&
    'paneId' in value &&
    typeof value.paneId === 'string' &&
    'definitionId' in value &&
    typeof value.definitionId === 'string'
  )
}
