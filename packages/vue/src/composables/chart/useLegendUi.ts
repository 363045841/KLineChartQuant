/** 处理 Core 图例发出的界面请求，领域操作全部由 LegendApi 执行。 */
import {
  type ChartController,
  INDICATOR_ROLE,
  type IndicatorRole,
  LEGEND_UI_EVENT,
  type LegendUiEventDetail,
} from '@363045841yyt/klinechart-core/controllers'
import { type Ref, ref, watch } from 'vue'

/** 连接图例界面请求与指标选择器/移动菜单，返回原位替换入口。 */
export function useLegendUi(
  controller: Ref<ChartController | null>,
  canvasLayer: Ref<HTMLElement | null>,
  options: {
    openSelector: () => void
    openIndicatorSettings: (definitionId: string) => void
    openScriptEditor?: (definitionId: string) => void
    /** 移动目标列表由 Core 投影，宿主在按钮下方打开自己的菜单。 */
    openMoveMenu: (request: LegendUiEventDetail & { action: 'move-to' }) => void
  },
) {
  const replacementId = ref<string | null>(null)
  const replacementRole = ref<IndicatorRole>(INDICATOR_ROLE.SUB)
  let replacementLegendId: string | null = null
  watch(
    canvasLayer,
    (layer, _previous, onCleanup) => {
      if (!layer) return
      // DOM 事件只携带打开界面或迁移目标的请求，不包含领域写入分支。
      function onRequest(event: Event): void {
        if (!(event instanceof CustomEvent) || !isLegendUiEventDetail(event.detail)) return
        const request = event.detail
        if (request.action === 'move-to') options.openMoveMenu(request)
        else if (request.action === 'settings') options.openIndicatorSettings(request.definitionId)
        else if (request.action === 'edit-code') options.openScriptEditor?.(request.definitionId)
        else {
          replacementLegendId = request.id
          replacementId.value =
            request.role === INDICATOR_ROLE.MAIN ? request.definitionId : request.paneId
          replacementRole.value = request.role
          options.openSelector()
        }
      }
      layer.addEventListener(LEGEND_UI_EVENT, onRequest)
      onCleanup(() => layer.removeEventListener(LEGEND_UI_EVENT, onRequest))
    },
    { immediate: true, flush: 'post' },
  )

  /** 选择器提交新定义后，先加载其实现，再以原图例身份执行原位替换。 */
  async function replaceLegend(_selectorId: string, definitionId: string): Promise<void> {
    const legendId = replacementLegendId
    const ctrl = controller.value
    replacementLegendId = null
    replacementId.value = null
    if (!legendId || !ctrl) return
    await ctrl.loadIndicators([definitionId])
    if (controller.value === ctrl) ctrl.legend.replace(legendId, definitionId)
  }
  return { replacementId, replacementRole, replaceLegend }
}

/** 校验跨 DOM 边界的界面请求。 */
function isLegendUiEventDetail(value: unknown): value is LegendUiEventDetail {
  if (!value || typeof value !== 'object' || !('action' in value)) return false
  // 事件由本包 Core 发布，只需确认判别字段；字段契约由 LegendUiEventDetail 保证。
  return (
    value.action === 'move-to' ||
    value.action === 'settings' ||
    value.action === 'replace' ||
    value.action === 'edit-code'
  )
}
