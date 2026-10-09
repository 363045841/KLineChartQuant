/** 处理 Core 图例发出的界面请求，领域操作全部由 LegendApi 执行。 */
import {
  type ChartController,
  LEGEND_UI_EVENT,
  type LegendUiRequest,
} from '@363045841yyt/klinechart-core/controllers'
import { type Ref, ref, watch } from 'vue'

/** 连接图例界面请求与指标选择器，返回原位替换入口。 */
export function useLegendUi(
  controller: Ref<ChartController | null>,
  canvasLayer: Ref<HTMLElement | null>,
  options: { openSelector: () => void; openIndicatorSettings: (definitionId: string) => void },
) {
  const replacementId = ref<string | null>(null)
  const replacementRole = ref<'main' | 'sub'>('sub')
  let replacementLegendId: string | null = null
  watch(
    canvasLayer,
    (layer, _previous, onCleanup) => {
      if (!layer) return
      // DOM 事件只携带打开设置或选择器的请求，不包含领域写入分支。
      function onRequest(event: Event): void {
        if (!(event instanceof CustomEvent) || !isLegendUiRequest(event.detail)) return
        const request = event.detail
        if (request.action === 'settings') options.openIndicatorSettings(request.definitionId)
        else {
          replacementLegendId = request.id
          replacementId.value = request.role === 'main' ? request.definitionId : request.paneId
          replacementRole.value = request.role
          options.openSelector()
        }
      }
      layer.addEventListener(LEGEND_UI_EVENT, onRequest)
      onCleanup(() => layer.removeEventListener(LEGEND_UI_EVENT, onRequest))
    },
    { immediate: true, flush: 'post' },
  )

  /** 选择器提交新定义后，以原图例身份执行原位替换。 */
  function replaceLegend(_selectorId: string, definitionId: string): void {
    if (replacementLegendId) controller.value?.legend.replace(replacementLegendId, definitionId)
    replacementLegendId = null
    replacementId.value = null
  }
  return { replacementId, replacementRole, replaceLegend }
}

/** 校验跨 DOM 边界的界面请求。 */
function isLegendUiRequest(value: unknown): value is LegendUiRequest {
  return (
    !!value &&
    typeof value === 'object' &&
    'action' in value &&
    (value.action === 'settings' || value.action === 'replace') &&
    'id' in value &&
    typeof value.id === 'string' &&
    'paneId' in value &&
    typeof value.paneId === 'string' &&
    'definitionId' in value &&
    typeof value.definitionId === 'string' &&
    'role' in value &&
    (value.role === 'main' || value.role === 'sub')
  )
}
